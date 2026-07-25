"use strict";
// ============================================================
// Clarification Engine — aggregate service
// ------------------------------------------------------------
// Persisted clarification lifecycle. No provider dependency.
// Token-based deterministic selection (no NL interpretation).
// All mutations are atomic (Prisma transactions).
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLARIFICATION_TTL_MS = void 0;
exports.createClarificationService = createClarificationService;
const node_crypto_1 = require("node:crypto");
const client_1 = require("../generated/prisma/client");
const errors_1 = require("./errors");
const TOKEN_BYTES = 32;
const TOKEN_PREFIX = 'clarify_';
exports.CLARIFICATION_TTL_MS = 15 * 60 * 1000;
const EXPIRED_TERMINAL_CODE = 'expired';
/**
 * Database-backed current time — never the application process clock.
 * Rendered as an explicit UTC ISO-8601 string (not a raw `timestamptz`
 * value) so parsing never depends on the driver's or process's local
 * timezone, which may differ from the database session's.
 */
async function dbNow(client) {
    const rows = await client.$queryRaw(client_1.Prisma.sql `SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "now"`);
    return new Date(rows[0].now);
}
function digestToken(token) {
    return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
}
function generateToken() {
    return TOKEN_PREFIX + (0, node_crypto_1.randomBytes)(TOKEN_BYTES).toString('base64url');
}
function assertValidTokenDigest(raw) {
    if (typeof raw !== 'string' || raw.length !== 64 || !/^[0-9a-f]{64}$/.test(raw)) {
        throw errors_1.AssistantError.invalidRequest('clarification token digest is invalid');
    }
    return raw;
}
/**
 * Parse a user-presented token into its digest.
 * The raw token is never persisted — only the digest is stored and compared.
 */
function tokenToDigest(raw) {
    if (typeof raw !== 'string' || raw.length < TOKEN_PREFIX.length + 16) {
        throw errors_1.AssistantError.invalidInput('clarification.select', 'token is invalid');
    }
    return digestToken(raw);
}
const KNOWN_ENTITY_TYPES = new Set(['wallet', 'merchant', 'category']);
/**
 * Structural validity of a persisted trustedContext blob. Guards against a
 * corrupted/malformed JSON payload before it's trusted for continuation.
 */
function isValidTrustedContext(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const ctx = value;
    return ctx.version === 1 &&
        ctx.operation === 'transaction.create' &&
        (ctx.type === 'INCOME' || ctx.type === 'EXPENSE') &&
        typeof ctx.amount === 'string' &&
        typeof ctx.date === 'string';
}
/** Maps a non-PENDING terminal status to its specific bounded error. */
function terminalStatusError(status, terminalCode) {
    if (status === 'CONSUMED')
        return errors_1.AssistantError.clarificationAlreadyConsumed();
    if (status === 'CANCELLED')
        return errors_1.AssistantError.clarificationCancelled();
    if (status === 'STALE')
        return terminalCode === EXPIRED_TERMINAL_CODE ? errors_1.AssistantError.clarificationExpired() : errors_1.AssistantError.clarificationStale();
    return errors_1.AssistantError.clarificationNotFound();
}
/**
 * Idempotent terminalization to STALE (restart required) — guarded by
 * status='PENDING'. If a concurrent transition already won the race, this
 * reports the actual winning terminal status instead of asserting the
 * caller's intended one.
 */
async function terminalizeOrReportActual(client, requestId, terminalCode, onWin) {
    const claimed = await client.clarificationRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { status: 'STALE', terminalCode, restartRequired: true },
    });
    if (claimed.count === 1)
        throw onWin();
    const current = await client.clarificationRequest.findUniqueOrThrow({ where: { id: requestId } });
    throw terminalStatusError(current.status, current.terminalCode);
}
function createClarificationService(db) {
    // ---- Create ---------------------------------------------------------------
    async function create(input, options = {}) {
        if (input.options.length === 0) {
            throw errors_1.AssistantError.invalidInput('clarification.create', 'at least one option is required');
        }
        if (input.options.some((opt) => !opt.candidateId?.trim())) {
            throw errors_1.AssistantError.invalidInput('clarification.create', 'every option must have a non-empty candidateId');
        }
        const tokens = input.options.map(() => ({
            raw: generateToken(),
            digest: '', // filled after generation
        }));
        // Fill digests
        for (const t of tokens) {
            t.digest = digestToken(t.raw);
        }
        const work = async (tx) => {
            // A fresh 15-minute expiry from database time — every clarification
            // (parent or child) gets its own; a parent's expiry is never extended.
            const expiresAt = new Date((await dbNow(tx)).getTime() + exports.CLARIFICATION_TTL_MS);
            const request = await tx.clarificationRequest.create({
                data: {
                    userId: input.userId,
                    conversationId: input.conversationId,
                    originatingTurnId: input.turnId,
                    executionId: input.executionId,
                    ...(input.parentClarificationId ? { parentId: input.parentClarificationId } : {}),
                    entityType: input.entityType,
                    status: 'PENDING',
                    trustedContext: input.trustedContext,
                    prompt: input.prompt,
                    expiresAt,
                },
            });
            await tx.clarificationOption.createMany({
                data: input.options.map((opt, i) => ({
                    requestId: request.id,
                    tokenDigest: tokens[i].digest,
                    displayLabel: opt.displayLabel,
                    discriminator: opt.discriminator ?? null,
                    candidateId: opt.candidateId,
                })),
            });
            return request;
        };
        const row = options.transaction ? await work(options.transaction) : await db.$transaction(work);
        return {
            clarificationId: row.id,
            entityType: row.entityType,
            prompt: row.prompt,
            options: input.options.map((opt, i) => ({
                token: tokens[i].raw,
                label: opt.displayLabel,
                ...(opt.discriminator ? { discriminator: opt.discriminator } : {}),
            })),
            expiresAt: row.expiresAt.toISOString(),
        };
    }
    // ---- Select ----------------------------------------------------------------
    async function select(input, options = {}) {
        // Token digest is pure hashing — no DB lookup, no information disclosed
        // about any specific request — so validating its shape up front is safe.
        const tokenDigest = tokenToDigest(input.token);
        assertValidTokenDigest(tokenDigest);
        // Plain (unlocked) read — a non-PENDING match must produce a specific
        // terminal error rather than being indistinguishable from "not found".
        // The fields read here (options, trustedContext, entityType, parentId)
        // are immutable after creation, so they stay valid through the claim below.
        const request = await db.clarificationRequest.findFirst({
            where: {
                conversationId: input.conversationId,
                userId: input.userId,
                ...(input.clarificationId ? { id: input.clarificationId } : {}),
            },
            include: { options: true },
            orderBy: { createdAt: 'desc' },
        });
        if (!request) {
            throw errors_1.AssistantError.clarificationNotFound();
        }
        // A previously-terminalized row (including a prior expiry) reports its
        // actual terminal outcome deterministically — repeat calls never re-derive it.
        if (request.status !== 'PENDING') {
            throw terminalStatusError(request.status, request.terminalCode);
        }
        // Lifecycle (expiry) is resolved from database time BEFORE the token is
        // ever matched against stored digests — an expired request never reveals
        // whether the supplied token would otherwise have been valid.
        const now = await dbNow(db);
        if (request.expiresAt <= now) {
            // Must commit even though the caller receives an error — runs outside
            // (not nested inside) the claim below, same as the other terminalizations.
            await terminalizeOrReportActual(db, request.id, EXPIRED_TERMINAL_CODE, () => errors_1.AssistantError.clarificationExpired());
        }
        // These terminalizations must also commit even though the caller receives
        // an error, so they run outside (not nested inside) the claim transaction.
        if (!isValidTrustedContext(request.trustedContext)) {
            await terminalizeOrReportActual(db, request.id, 'context_invalid', () => errors_1.AssistantError.clarificationContextInvalid());
        }
        if (!KNOWN_ENTITY_TYPES.has(request.entityType)) {
            await terminalizeOrReportActual(db, request.id, 'continuation_invalid', () => errors_1.AssistantError.clarificationContinuationInvalid());
        }
        const matched = request.options.find((o) => o.tokenDigest === tokenDigest);
        if (!matched) {
            throw errors_1.AssistantError.clarificationInvalidOption();
        }
        // Atomic claim: only succeeds if the row is still PENDING at commit time.
        // Under a concurrent same-token race, exactly one caller wins this single
        // UPDATE; the loser observes count === 0 and reports the winner's outcome.
        // Runs against the caller-supplied transaction (when provided) so this
        // claim commits or rolls back together with whatever downstream work
        // (child clarification / draft creation, Assistant lifecycle persistence)
        // the caller performs in that same transaction.
        const client = options.transaction ?? db;
        const claimed = await client.clarificationRequest.updateMany({
            where: { id: request.id, status: 'PENDING' },
            data: { status: 'CONSUMED', consumedAt: now },
        });
        if (claimed.count !== 1) {
            const current = await client.clarificationRequest.findUniqueOrThrow({ where: { id: request.id } });
            throw terminalStatusError(current.status, current.terminalCode);
        }
        const trustedContext = request.trustedContext;
        return {
            clarificationId: request.id,
            entityType: request.entityType,
            status: 'CONSUMED',
            selectedCandidateId: matched.candidateId,
            selectedDisplayLabel: matched.displayLabel,
            trustedContext,
            previousTrustedContext: trustedContext,
            ...(request.parentId ? { parentId: request.parentId } : {}),
        };
    }
    // ---- Cancel ----------------------------------------------------------------
    async function cancel(input, options = {}) {
        // Plain (unlocked) read, same rationale as select(): a non-PENDING match
        // must produce its specific terminal outcome, not be folded into the
        // claim transaction below.
        const request = await db.clarificationRequest.findFirst({
            where: {
                id: input.clarificationId,
                userId: input.userId,
                ...(input.conversationId ? { conversationId: input.conversationId } : {}),
            },
        });
        if (!request) {
            throw errors_1.AssistantError.clarificationNotFound();
        }
        // Repeated cancellation is idempotent and safe — already-cancelled is a
        // no-op success, not an error.
        if (request.status === 'CANCELLED')
            return;
        if (request.status !== 'PENDING') {
            throw terminalStatusError(request.status, request.terminalCode);
        }
        // Lifecycle (expiry) is resolved from database time before the
        // cancellation claim, and — like the other early terminalizations — must
        // commit even though the caller receives an error, so it runs against
        // `db` directly rather than the claim transaction below.
        const now = await dbNow(db);
        if (request.expiresAt <= now) {
            await terminalizeOrReportActual(db, request.id, EXPIRED_TERMINAL_CODE, () => errors_1.AssistantError.clarificationExpired());
        }
        // Atomic claim, same race-safety rationale as select().
        const client = options.transaction ?? db;
        const claimed = await client.clarificationRequest.updateMany({
            where: { id: request.id, status: 'PENDING' },
            data: {
                status: 'CANCELLED',
                cancelledAt: now,
                terminalCode: input.reason || 'user_cancelled',
                restartRequired: true,
            },
        });
        if (claimed.count !== 1) {
            const current = await client.clarificationRequest.findUniqueOrThrow({ where: { id: request.id } });
            if (current.status === 'CANCELLED')
                return;
            throw terminalStatusError(current.status, current.terminalCode);
        }
    }
    // ---- State projection ------------------------------------------------------
    async function getAssistantState(userId, conversationId) {
        const [activeRequest, pendingDraft, latestTerminal] = await Promise.all([
            db.clarificationRequest.findFirst({
                where: { conversationId, userId, status: 'PENDING' },
                include: { options: true },
                orderBy: { createdAt: 'desc' },
            }),
            db.assistantFinancialDraft.findFirst({
                where: { conversationId, userId, status: 'PENDING_CONFIRMATION' },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    status: true,
                    operation: true,
                    transactionType: true,
                    amount: true,
                    walletId: true,
                    categoryId: true,
                    transactionDate: true,
                    description: true,
                    expiresAt: true,
                },
            }),
            db.clarificationRequest.findFirst({
                where: {
                    conversationId,
                    userId,
                    status: { in: ['CONSUMED', 'CANCELLED', 'STALE'] },
                },
                orderBy: { updatedAt: 'desc' },
            }),
        ]);
        const activeClarification = activeRequest ? {
            clarificationId: activeRequest.id,
            entityType: activeRequest.entityType,
            prompt: activeRequest.prompt,
            options: activeRequest.options.map((opt) => ({
                label: opt.displayLabel,
                ...(opt.discriminator ? { discriminator: opt.discriminator } : {}),
            })),
            expiresAt: activeRequest.expiresAt.toISOString(),
        } : undefined;
        const safeDraft = pendingDraft ? {
            draftId: pendingDraft.id,
            status: pendingDraft.status,
            preview: {
                operation: pendingDraft.operation,
                type: pendingDraft.transactionType,
                amount: pendingDraft.amount.toString(),
                walletId: pendingDraft.walletId,
                categoryId: pendingDraft.categoryId,
                date: pendingDraft.transactionDate.toISOString().slice(0, 10),
                ...(pendingDraft.description ? { description: pendingDraft.description } : {}),
                expiresAt: pendingDraft.expiresAt.toISOString(),
            },
        } : undefined;
        const terminal = (latestTerminal && latestTerminal.status !== 'PENDING') ? {
            clarificationId: latestTerminal.id,
            entityType: latestTerminal.entityType,
            status: latestTerminal.status,
            ...(latestTerminal.terminalCode ? { terminalCode: latestTerminal.terminalCode } : {}),
            restartRequired: latestTerminal.restartRequired,
        } : undefined;
        return {
            ...(activeClarification ? { activeClarification } : {}),
            ...(safeDraft ? { pendingDraft: safeDraft } : {}),
            ...(terminal ? { latestTerminalClarification: terminal } : {}),
        };
    }
    // ---- Sequential continuation -----------------------------------------------
    /**
     * After a successful selection, determine the next step in the sequential
     * clarification chain: wallet → merchant → category → draft.
     *
     * Called by the application service after consuming a clarification.
     * The caller is responsible for entity resolution of the next ambiguity.
     */
    function buildConsumedResult(consumedClarificationId) {
        return { consumedClarificationId };
    }
    /**
     * Runs `work` in a single interactive Prisma transaction and returns its
     * result. Callers (application service) use this to make the clarification
     * claim, any child clarification / draft creation, and Assistant lifecycle
     * persistence commit or roll back together. Reuses `existing` instead of
     * opening a nested transaction when the caller is already inside one.
     */
    function runInTransaction(work, existing) {
        return existing ? work(existing) : db.$transaction(work);
    }
    return {
        create,
        select,
        cancel,
        getAssistantState,
        buildConsumedResult,
        runInTransaction,
        // Exported for tests only
        _digestToken: digestToken,
        _generateToken: generateToken,
    };
}
//# sourceMappingURL=clarification.service.js.map
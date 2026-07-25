"use strict";
// ============================================================
// Clarification Engine — aggregate service
// ------------------------------------------------------------
// Persisted clarification lifecycle. No provider dependency.
// Token-based deterministic selection (no NL interpretation).
// All mutations are atomic (Prisma transactions).
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClarificationService = createClarificationService;
const node_crypto_1 = require("node:crypto");
const errors_1 = require("./errors");
const TOKEN_BYTES = 32;
const TOKEN_PREFIX = 'clarify_';
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
function createClarificationService(db) {
    // ---- Create ---------------------------------------------------------------
    async function create(input) {
        if (input.options.length === 0) {
            throw errors_1.AssistantError.invalidInput('clarification.create', 'at least one option is required');
        }
        if (input.options.some((opt) => !opt.candidateId?.trim())) {
            throw errors_1.AssistantError.invalidInput('clarification.create', 'every option must have a non-empty candidateId');
        }
        const now = new Date();
        const tokens = input.options.map(() => ({
            raw: generateToken(),
            digest: '', // filled after generation
        }));
        // Fill digests
        for (const t of tokens) {
            t.digest = digestToken(t.raw);
        }
        const row = await db.$transaction(async (tx) => {
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
        });
        return {
            clarificationId: row.id,
            entityType: row.entityType,
            prompt: row.prompt,
            options: input.options.map((opt, i) => ({
                token: tokens[i].raw,
                label: opt.displayLabel,
                ...(opt.discriminator ? { discriminator: opt.discriminator } : {}),
            })),
        };
    }
    // ---- Select ----------------------------------------------------------------
    async function select(input) {
        const tokenDigest = tokenToDigest(input.token);
        assertValidTokenDigest(tokenDigest);
        return db.$transaction(async (tx) => {
            // Lock the clarification request to prevent races
            const request = await tx.clarificationRequest.findFirst({
                where: { conversationId: input.conversationId, userId: input.userId, status: 'PENDING' },
                include: { options: true },
                orderBy: { createdAt: 'desc' },
            });
            if (!request) {
                throw errors_1.AssistantError.conversationNotContinuable();
            }
            // ponytail: advisory lock via row selection already gives us per-conversation
            // serialisation since we only ever have one PENDING clarification per conversation.
            const matched = request.options.find((o) => o.tokenDigest === tokenDigest);
            if (!matched) {
                throw errors_1.AssistantError.invalidInput('clarification.select', 'token does not match any active option');
            }
            const now = new Date();
            const updated = await tx.clarificationRequest.update({
                where: { id: request.id },
                data: { status: 'CONSUMED', consumedAt: now },
                include: { options: true },
            });
            const trustedContext = updated.trustedContext;
            return {
                clarificationId: updated.id,
                entityType: updated.entityType,
                status: 'CONSUMED',
                selectedCandidateId: matched.candidateId,
                selectedDisplayLabel: matched.displayLabel,
                trustedContext,
                previousTrustedContext: trustedContext,
                ...(updated.parentId ? { parentId: updated.parentId } : {}),
            };
        });
    }
    // ---- Cancel ----------------------------------------------------------------
    async function cancel(input) {
        await db.$transaction(async (tx) => {
            const request = await tx.clarificationRequest.findFirst({
                where: { id: input.clarificationId, userId: input.userId, status: 'PENDING' },
            });
            if (!request) {
                throw errors_1.AssistantError.conversationNotContinuable();
            }
            await tx.clarificationRequest.update({
                where: { id: request.id },
                data: {
                    status: 'CANCELLED',
                    cancelledAt: new Date(),
                    terminalCode: input.reason || 'user_cancelled',
                    restartRequired: true,
                },
            });
        });
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
    return {
        create,
        select,
        cancel,
        getAssistantState,
        buildConsumedResult,
        // Exported for tests only
        _digestToken: digestToken,
        _generateToken: generateToken,
    };
}
//# sourceMappingURL=clarification.service.js.map
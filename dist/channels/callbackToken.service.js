"use strict";
// ============================================================
// ChannelCallbackToken — opaque inline-keyboard button handles.
// ------------------------------------------------------------
// Mirrors ClarificationOption.tokenDigest (Phase 24): the raw token is
// returned to the caller exactly once (to embed in Telegram callback_data)
// and never persisted — only its digest is stored. `actionSecret` is a
// separate, server-side-only field (never sent to Telegram) that wraps
// whatever material the authoritative service needs to complete the action
// (currently: the raw ClarificationOption token for CLARIFICATION_SELECT).
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.CALLBACK_TOKEN_TTL_MS = void 0;
exports.createCallbackToken = createCallbackToken;
exports.findCallbackTokenByRaw = findCallbackTokenByRaw;
exports.claimCallbackToken = claimCallbackToken;
exports.expireCallbackToken = expireCallbackToken;
exports.staleCallbackToken = staleCallbackToken;
const node_crypto_1 = require("node:crypto");
const TOKEN_PREFIX = 'cbk_';
const TOKEN_BYTES = 24;
exports.CALLBACK_TOKEN_TTL_MS = 15 * 60 * 1000;
function digestCallbackToken(raw) {
    return (0, node_crypto_1.createHash)('sha256').update(raw).digest('hex');
}
function generateCallbackToken() {
    return TOKEN_PREFIX + (0, node_crypto_1.randomBytes)(TOKEN_BYTES).toString('base64url');
}
/** Creates a token row and returns its plaintext once — the only value that ever goes into Telegram callback_data. */
async function createCallbackToken(db, input) {
    const token = generateCallbackToken();
    const row = await db.channelCallbackToken.create({
        data: {
            provider: 'TELEGRAM',
            tokenDigest: digestCallbackToken(token),
            connectionId: input.connectionId,
            conversationId: input.conversationId,
            interactionType: input.interactionType,
            clarificationRequestId: input.clarificationRequestId ?? null,
            clarificationOptionId: input.clarificationOptionId ?? null,
            financialDraftId: input.financialDraftId ?? null,
            actionSecret: input.actionSecret ?? null,
            expiresAt: new Date(Date.now() + exports.CALLBACK_TOKEN_TTL_MS),
        },
    });
    return { id: row.id, token };
}
/** Digest lookup only — the raw callback_data handle is never trusted as anything but a lookup key. */
function findCallbackTokenByRaw(db, rawToken) {
    return db.channelCallbackToken.findUnique({
        where: { provider_tokenDigest: { provider: 'TELEGRAM', tokenDigest: digestCallbackToken(rawToken) } },
    });
}
/**
 * Atomic one-time claim — the actual concurrency guard between two
 * independent button presses on the same token (mirrors ClarificationRequest's
 * PENDING->CONSUMED conditional update). Clears `actionSecret` on success.
 */
async function claimCallbackToken(db, id) {
    const claimed = await db.channelCallbackToken.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'CONSUMED', consumedAt: new Date(), actionSecret: null },
    });
    return claimed.count === 1;
}
/** Lazy terminalization on read, mirroring ClarificationRequest's expiry-on-read pattern. */
async function expireCallbackToken(db, id) {
    await db.channelCallbackToken.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'EXPIRED', actionSecret: null } });
}
async function staleCallbackToken(db, id) {
    await db.channelCallbackToken.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'STALE', actionSecret: null } });
}
//# sourceMappingURL=callbackToken.service.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHANNEL_LINK_TOKEN_TTL_MS = void 0;
exports.createChannelLinkTokenService = createChannelLinkTokenService;
const crypto_1 = require("crypto");
const errors_1 = require("./errors");
exports.CHANNEL_LINK_TOKEN_TTL_MS = 10 * 60 * 1000;
function generateToken() {
    return (0, crypto_1.randomBytes)(32).toString('base64url');
}
function digest(token) {
    return (0, crypto_1.createHash)('sha256').update(token).digest('hex');
}
function createChannelLinkTokenService(db, clock = () => new Date()) {
    /** Mints a one-time linking code for the authenticated user. Raw value returned once, never persisted. */
    async function createLinkToken(userId, provider) {
        const token = generateToken();
        const expiresAt = new Date(clock().getTime() + exports.CHANNEL_LINK_TOKEN_TTL_MS);
        await db.channelLinkToken.create({
            data: { userId, provider, tokenDigest: digest(token), expiresAt },
        });
        return { token, expiresAt };
    }
    /**
     * Atomically claims a linking code and binds the external identity to the
     * owning user's ChannelConnection. Invalid/expired/already-used tokens all
     * throw the same error — deliberately indistinguishable to the caller.
     * Never transfers an identity already bound to a different user.
     */
    async function consumeLinkToken(rawToken, provider, externalUserId, externalChatId) {
        const tokenDigest = digest(rawToken);
        const now = clock();
        return db.$transaction(async (tx) => {
            const claimed = await tx.channelLinkToken.updateMany({
                where: { provider, tokenDigest, consumedAt: null, expiresAt: { gt: now } },
                data: { consumedAt: now },
            });
            if (claimed.count !== 1)
                throw errors_1.ChannelError.linkInvalidOrExpired();
            const record = await tx.channelLinkToken.findFirstOrThrow({ where: { provider, tokenDigest } });
            const existingByIdentity = await tx.channelConnection.findUnique({
                where: { provider_externalUserId: { provider, externalUserId } },
            });
            if (existingByIdentity && existingByIdentity.userId !== record.userId) {
                throw errors_1.ChannelError.linkIdentityConflict();
            }
            const connection = await tx.channelConnection.upsert({
                where: { userId_provider: { userId: record.userId, provider } },
                create: { userId: record.userId, provider, externalUserId, externalChatId, status: 'ACTIVE' },
                update: { externalUserId, externalChatId, status: 'ACTIVE', revokedAt: null },
            });
            return { userId: record.userId, connectionId: connection.id };
        });
    }
    return { createLinkToken, consumeLinkToken };
}
//# sourceMappingURL=linkToken.service.js.map
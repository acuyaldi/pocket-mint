"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChannelConnectionService = createChannelConnectionService;
function createChannelConnectionService(db) {
    /** Resolves an external identity to its active connection, or null if unlinked/revoked. */
    async function getActiveConnection(provider, externalUserId) {
        const row = await db.channelConnection.findUnique({ where: { provider_externalUserId: { provider, externalUserId } } });
        if (!row || row.status !== 'ACTIVE')
            return null;
        return { id: row.id, userId: row.userId, conversationId: row.conversationId, status: row.status, linkedAt: row.linkedAt };
    }
    async function getByUser(userId, provider) {
        const row = await db.channelConnection.findUnique({ where: { userId_provider: { userId, provider } } });
        if (!row)
            return null;
        return { id: row.id, userId: row.userId, conversationId: row.conversationId, status: row.status, linkedAt: row.linkedAt };
    }
    /** Idempotent: revoking an already-revoked or nonexistent connection is a no-op. */
    async function revoke(userId, provider) {
        await db.channelConnection.updateMany({
            where: { userId, provider, status: 'ACTIVE' },
            data: { status: 'REVOKED', revokedAt: new Date() },
        });
    }
    async function setCurrentConversation(connectionId, conversationId) {
        await db.channelConnection.update({ where: { id: connectionId }, data: { conversationId } });
    }
    return { getActiveConnection, getByUser, revoke, setCurrentConversation };
}
//# sourceMappingURL=connection.service.js.map
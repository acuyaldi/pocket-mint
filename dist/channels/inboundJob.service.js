"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInboundJob = createInboundJob;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TEXT_LENGTH = 4096;
/**
 * Atomically persists an inbound channel update as a durable job — this IS the
 * dedup guarantee (the unique (provider, externalUpdateId) constraint), now
 * carrying full job-lifecycle state instead of a bare marker row (evolved from
 * Phase 25's ChannelUpdateDedup — see docs/product/decisions/015). Returns
 * false if this update_id was already accepted (retried webhook delivery).
 *
 * Only the bounded extracted text is persisted — never the raw provider
 * Update payload (no metadata, entities, or sender profile).
 *
 * ponytail: retention cleanup runs best-effort on every call (bounded
 * deleteMany), same as Phase 25's dedup table — this repo still has no
 * cron. Upgrade to a scheduled job if row volume ever becomes a problem.
 */
async function createInboundJob(db, connectionId, message) {
    try {
        await db.$transaction([
            db.channelInboundJob.create({
                data: {
                    provider: message.provider,
                    externalUpdateId: message.externalUpdateId,
                    channelConnectionId: connectionId,
                    externalSenderId: message.externalSenderId,
                    externalChatId: message.externalChatId,
                    text: message.text.slice(0, MAX_TEXT_LENGTH),
                    kind: message.kind ?? 'MESSAGE',
                    ...(message.callbackQueryId ? { callbackQueryId: message.callbackQueryId } : {}),
                    ...(message.callbackMessageId ? { callbackMessageId: message.callbackMessageId } : {}),
                },
            }),
            db.channelInboundJob.deleteMany({
                where: {
                    status: 'SUCCEEDED',
                    completedAt: { lt: new Date(Date.now() - RETENTION_MS) },
                },
            }),
        ]);
        return true;
    }
    catch (error) {
        if (error.code === 'P2002')
            return false;
        throw error;
    }
}
//# sourceMappingURL=inboundJob.service.js.map
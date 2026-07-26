"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimTelegramUpdate = claimTelegramUpdate;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Atomically claims a Telegram update_id so a retried webhook delivery is a
 * no-op instead of a duplicate Assistant turn. Returns false if this update
 * was already processed.
 *
 * ponytail: retention cleanup runs best-effort on every call (bounded
 * deleteMany) instead of a scheduled job — this repo has no queue/cron
 * infrastructure. Upgrade to a real job if row count ever becomes a problem.
 */
async function claimTelegramUpdate(db, externalUpdateId) {
    try {
        await db.$transaction([
            db.channelUpdateDedup.create({ data: { provider: 'TELEGRAM', externalUpdateId } }),
            db.channelUpdateDedup.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } }),
        ]);
        return true;
    }
    catch (error) {
        if (error.code === 'P2002')
            return false;
        throw error;
    }
}
//# sourceMappingURL=dedup.js.map
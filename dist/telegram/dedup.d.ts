import type { PrismaClient } from '../generated/prisma/client';
/**
 * Atomically claims a Telegram update_id so a retried webhook delivery is a
 * no-op instead of a duplicate Assistant turn. Returns false if this update
 * was already processed.
 *
 * ponytail: retention cleanup runs best-effort on every call (bounded
 * deleteMany) instead of a scheduled job — this repo has no queue/cron
 * infrastructure. Upgrade to a real job if row count ever becomes a problem.
 */
export declare function claimTelegramUpdate(db: PrismaClient, externalUpdateId: string): Promise<boolean>;

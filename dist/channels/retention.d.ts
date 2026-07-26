import type { PrismaClient } from '../generated/prisma/client';
/**
 * Bounded, opportunistic retention cleanup — run from inside a worker's poll
 * tick (no cron exists in this repo). Only ever deletes SUCCEEDED/terminal
 * rows past their window; PENDING/PROCESSING/leased rows are never touched.
 */
export declare function cleanupChannelRecords(db: PrismaClient, retentionDays: number): Promise<void>;

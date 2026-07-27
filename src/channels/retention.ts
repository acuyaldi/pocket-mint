import type { PrismaClient } from '../generated/prisma/client';

const TERMINAL_RETENTION_MULTIPLIER = 4; // failed jobs kept longer for debugging (e.g. 7d success -> 28d terminal)

/**
 * Bounded, opportunistic retention cleanup — run from inside a worker's poll
 * tick (no cron exists in this repo). Only ever deletes SUCCEEDED/terminal
 * rows past their window; PENDING/PROCESSING/leased rows are never touched.
 */
export async function cleanupChannelRecords(db: PrismaClient, retentionDays: number): Promise<void> {
  const successCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const terminalCutoff = new Date(Date.now() - retentionDays * TERMINAL_RETENTION_MULTIPLIER * 24 * 60 * 60 * 1000);

  await db.channelOutboundDelivery.deleteMany({
    where: {
      OR: [
        { status: 'SENT', updatedAt: { lt: successCutoff } },
        { status: 'FAILED_TERMINAL', updatedAt: { lt: terminalCutoff } },
      ],
    },
  });

  await db.channelInboundJob.deleteMany({
    where: {
      OR: [
        { status: 'SUCCEEDED', completedAt: { lt: successCutoff } },
        { status: 'FAILED_TERMINAL', completedAt: { lt: terminalCutoff } },
      ],
    },
  });

  // Only ever terminal callback tokens — PENDING (even past expiresAt, before
  // lazy transition) and tokens a still-processing job might reference are
  // never touched.
  await db.channelCallbackToken.deleteMany({
    where: {
      status: { in: ['CONSUMED', 'EXPIRED', 'CANCELLED', 'STALE'] },
      updatedAt: { lt: successCutoff },
    },
  });
}

import type { PrismaClient } from '../generated/prisma/client';
import type { InboundChannelMessage } from './types';
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
export declare function createInboundJob(db: PrismaClient, connectionId: string | null, message: InboundChannelMessage): Promise<boolean>;

import type { PrismaClient } from '../../generated/prisma/client';
import type { TelegramClient } from '../../telegram/client';
import { logEvent } from '../../utils/logger';
import { claimOutboundDeliveries, type ClaimedDelivery } from './claim';
import { decideRetry } from './retry';
import { cleanupChannelRecords } from '../retention';
import type { ChannelWorkerConfig } from '../workerConfig';

export interface OutboundWorkerDeps {
  readonly db: PrismaClient;
  readonly client: TelegramClient;
  readonly config: ChannelWorkerConfig;
  readonly owner: string;
}

/** Telegram's own 429 retry_after (client.ts already honors it inline once); this is the outer, durable retry schedule. */
const OUTER_BACKOFF = { baseMs: 2000, maxMs: 5 * 60_000 };

/** Exported for direct unit testing — pollOnce composes this with the raw-SQL claim step. */
export async function processDelivery(deps: OutboundWorkerDeps, delivery: ClaimedDelivery): Promise<void> {
  const outcome = await deps.client.sendMessage(delivery.destinationChatId, delivery.renderedText);

  if (outcome.ok) {
    await deps.db.channelOutboundDelivery.update({
      where: { id: delivery.id },
      data: { status: 'SENT', sentAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
    });
    logEvent('info', { event: 'channel.outbound.sent', requestId: delivery.id, provider: 'telegram', attempt: delivery.attempt });
    return;
  }

  const decision = decideRetry(outcome.category, delivery.attempt, deps.config.maxAttemptsOutbound, OUTER_BACKOFF);
  await deps.db.channelOutboundDelivery.update({
    where: { id: delivery.id },
    data: decision.outcome === 'retry'
      ? { status: 'FAILED_RETRYABLE', availableAt: decision.availableAt, leaseOwner: null, leaseExpiresAt: null, errorCategory: outcome.category }
      : { status: 'FAILED_TERMINAL', leaseOwner: null, leaseExpiresAt: null, errorCategory: outcome.category },
  });
  logEvent(decision.outcome === 'retry' ? 'info' : 'warn', {
    event: decision.outcome === 'retry' ? 'channel.outbound.retry_scheduled' : 'channel.outbound.failed',
    requestId: delivery.id,
    provider: 'telegram',
    attempt: delivery.attempt,
    errorCategory: outcome.category,
    retryable: decision.outcome === 'retry',
  });
}

export function createOutboundWorker(deps: OutboundWorkerDeps) {
  async function pollOnce(): Promise<number> {
    const deliveries = await claimOutboundDeliveries(deps.db, {
      batchSize: deps.config.batchSize,
      leaseMs: deps.config.leaseMs,
      owner: deps.owner,
    });
    for (const delivery of deliveries) {
      if (delivery.attempt > 1) {
        logEvent('info', { event: 'channel.outbound.claimed', requestId: delivery.id, provider: 'telegram', attempt: delivery.attempt, leaseRecovered: true });
      }
      await processDelivery(deps, delivery);
    }
    if (deliveries.length > 0) {
      await cleanupChannelRecords(deps.db, deps.config.retentionDays).catch(() => undefined);
    }
    return deliveries.length;
  }

  return { pollOnce };
}

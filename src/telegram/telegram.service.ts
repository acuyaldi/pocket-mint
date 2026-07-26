import type { PrismaClient } from '../generated/prisma/client';
import type { ChannelConnectionService } from '../channels/connection.service';
import { normalizeTelegramUpdate } from './envelope';
import { createInboundJob } from '../channels/inboundJob.service';
import { logEvent } from '../utils/logger';

export interface TelegramServiceDeps {
  readonly db: PrismaClient;
  readonly connections: ChannelConnectionService;
}

/**
 * Webhook-facing entry point. Performs ONLY bounded transport work: parse,
 * classify, resolve identity (read-only), and durably persist the update as a
 * ChannelInboundJob before returning — see docs/product/decisions/015. Never
 * invokes the Assistant or Telegram delivery; that happens in the inbound/
 * outbound workers (src/channels/workers/), independently of webhook latency.
 */
export function createTelegramService(deps: TelegramServiceDeps) {
  async function handleUpdate(rawUpdate: unknown, correlationId: string): Promise<void> {
    const envelope = normalizeTelegramUpdate(rawUpdate);
    if (!envelope) {
      logEvent('info', { event: 'channel.webhook.received', requestId: correlationId, provider: 'telegram', outcome: 'unsupported' });
      return;
    }

    const connection = await deps.connections.getActiveConnection('TELEGRAM', envelope.externalSenderId);
    const isNew = await createInboundJob(deps.db, connection?.id ?? null, envelope);
    if (!isNew) {
      logEvent('info', { event: 'channel.inbound.duplicate', requestId: correlationId, provider: 'telegram' });
      return;
    }
    logEvent('info', { event: 'channel.webhook.received', requestId: correlationId, provider: 'telegram', outcome: 'accepted' });
    logEvent('info', { event: 'channel.inbound.accepted', requestId: correlationId, provider: 'telegram' });
  }

  return { handleUpdate };
}

export type TelegramService = ReturnType<typeof createTelegramService>;

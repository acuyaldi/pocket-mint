import type { PrismaClient } from '../generated/prisma/client';
import type { ChannelConnectionService } from '../channels/connection.service';
import type { TelegramClient } from './client';
import { normalizeTelegramUpdate } from './envelope';
import { createInboundJob } from '../channels/inboundJob.service';
import { logEvent } from '../utils/logger';

export interface TelegramServiceDeps {
  readonly db: PrismaClient;
  readonly connections: ChannelConnectionService;
  readonly client: TelegramClient;
}

/**
 * Webhook-facing entry point. Performs ONLY bounded transport work: parse,
 * classify, resolve identity (read-only), durably persist the update as a
 * ChannelInboundJob, and — for a callback query — synchronously acknowledge
 * it. Never invokes the Assistant, never resolves clarification/draft
 * ownership, never edits the Telegram message, never waits on the durable
 * worker; that happens in the inbound/outbound workers (src/channels/workers/)
 * independently of webhook latency. See docs/product/decisions/015.
 *
 * A failure to acknowledge the callback (network hiccup, Telegram error) must
 * not undo durable inbound acceptance — the job was already committed above,
 * so `answerCallbackQuery` failure here is swallowed and only logged; the
 * durable worker still processes the job normally (Telegram may show the
 * user a spinner timeout, but retrying the same update is deduplicated and
 * the underlying action still executes at most once).
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

    if (envelope.kind === 'CALLBACK' && envelope.callbackQueryId) {
      const acknowledged = await deps.client.answerCallbackQuery(envelope.callbackQueryId).catch(() => ({ ok: false as const, category: 'provider_unavailable' as const }));
      logEvent(acknowledged.ok ? 'info' : 'warn', {
        event: 'channel.telegram.callback_acknowledged',
        requestId: correlationId,
        provider: 'telegram',
        outcome: acknowledged.ok ? 'accepted' : 'failed',
        ...(acknowledged.ok ? {} : { errorCategory: acknowledged.category }),
      });
    }

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

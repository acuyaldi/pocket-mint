import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { telegramConfig } from '../config';
import { telegramService } from '../telegram/bootstrap';
import { logEvent } from '../utils/logger';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Verifies Telegram's shared secret header before any parsing/processing happens. */
export function verifyTelegramWebhookSecret(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header(SECRET_HEADER);
  if (!telegramConfig.enabled || !provided || !safeEqual(provided, telegramConfig.webhookSecret!)) {
    logEvent('warn', { event: 'channel.webhook.rejected', requestId: req.correlationId, provider: 'telegram' });
    res.status(401).json({ success: false, error: { code: 'CHANNEL_WEBHOOK_AUTH_FAILED', statusCode: 401, message: 'Unauthorized' } });
    return;
  }
  next();
}

/**
 * Persists the update as a durable ChannelInboundJob and acknowledges — never
 * invokes the Assistant or Telegram delivery in the request path (see
 * docs/product/decisions/015). `telegramService.handleUpdate` is awaited only
 * long enough to durably accept the update (bounded DB writes); the inbound/
 * outbound workers do the rest independently of webhook latency. Always
 * returns 200 for a handled update, including unsupported/duplicate ones —
 * only the secret check above can 401.
 */
export async function telegramWebhook(req: Request, res: Response): Promise<void> {
  if (telegramService) {
    try {
      await telegramService.handleUpdate(req.body, req.correlationId);
    } catch {
      logEvent('error', { event: 'channel.assistant.failed', requestId: req.correlationId, provider: 'telegram' });
    }
  }
  res.status(200).json({ ok: true });
}

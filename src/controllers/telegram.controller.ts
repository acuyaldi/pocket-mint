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
 * Processes the update SYNCHRONOUSLY before acknowledging — this repo has no
 * queue/background-job infrastructure (see docs/product/decisions/013), so a
 * "respond 200 then keep working" fire-and-forget promise would be lost on a
 * process restart mid-request. Telegram's update_id dedup (src/telegram/dedup.ts)
 * is the safety net if a retried delivery arrives after a slow response.
 * Always returns 200 for a handled update, including unsupported/ignored ones
 * — only the secret check above can 401.
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

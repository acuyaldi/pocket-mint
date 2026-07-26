import type { NextFunction, Request, Response } from 'express';
/** Verifies Telegram's shared secret header before any parsing/processing happens. */
export declare function verifyTelegramWebhookSecret(req: Request, res: Response, next: NextFunction): void;
/**
 * Persists the update as a durable ChannelInboundJob and acknowledges — never
 * invokes the Assistant or Telegram delivery in the request path (see
 * docs/product/decisions/015). `telegramService.handleUpdate` is awaited only
 * long enough to durably accept the update (bounded DB writes); the inbound/
 * outbound workers do the rest independently of webhook latency. Always
 * returns 200 for a handled update, including unsupported/duplicate ones —
 * only the secret check above can 401.
 */
export declare function telegramWebhook(req: Request, res: Response): Promise<void>;

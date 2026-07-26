import type { NextFunction, Request, Response } from 'express';
/** Verifies Telegram's shared secret header before any parsing/processing happens. */
export declare function verifyTelegramWebhookSecret(req: Request, res: Response, next: NextFunction): void;
/**
 * Processes the update SYNCHRONOUSLY before acknowledging — this repo has no
 * queue/background-job infrastructure (see docs/product/decisions/013), so a
 * "respond 200 then keep working" fire-and-forget promise would be lost on a
 * process restart mid-request. Telegram's update_id dedup (src/telegram/dedup.ts)
 * is the safety net if a retried delivery arrives after a slow response.
 * Always returns 200 for a handled update, including unsupported/ignored ones
 * — only the secret check above can 401.
 */
export declare function telegramWebhook(req: Request, res: Response): Promise<void>;

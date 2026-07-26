import { Router } from 'express';
import { telegramWebhook, verifyTelegramWebhookSecret } from '../controllers/telegram.controller';
import { telegramWebhookLimiter } from '../middleware/rateLimit';

const telegramRouter = Router();

// The first genuinely public route in this backend: Telegram cannot send a
// Pocket Mint bearer token, so this route deliberately has no requireUser.
// CORS is a non-issue (server-to-server, no Origin header). Ownership is
// established downstream via the linked ChannelConnection, never via a
// client-supplied user id. Body parsing (100kb default) already happened in
// the global express.json() (app.ts) before this router runs.
telegramRouter.post('/webhook', telegramWebhookLimiter, verifyTelegramWebhookSecret, telegramWebhook);

export { telegramRouter };

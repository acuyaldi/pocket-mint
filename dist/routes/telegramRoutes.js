"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramRouter = void 0;
const express_1 = require("express");
const telegram_controller_1 = require("../controllers/telegram.controller");
const rateLimit_1 = require("../middleware/rateLimit");
const telegramRouter = (0, express_1.Router)();
exports.telegramRouter = telegramRouter;
// The first genuinely public route in this backend: Telegram cannot send a
// Pocket Mint bearer token, so this route deliberately has no requireUser.
// CORS is a non-issue (server-to-server, no Origin header). Ownership is
// established downstream via the linked ChannelConnection, never via a
// client-supplied user id. Body parsing (100kb default) already happened in
// the global express.json() (app.ts) before this router runs.
telegramRouter.post('/webhook', rateLimit_1.telegramWebhookLimiter, telegram_controller_1.verifyTelegramWebhookSecret, telegram_controller_1.telegramWebhook);
//# sourceMappingURL=telegramRoutes.js.map
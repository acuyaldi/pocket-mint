"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTelegramWebhookSecret = verifyTelegramWebhookSecret;
exports.telegramWebhook = telegramWebhook;
const crypto_1 = require("crypto");
const config_1 = require("../config");
const bootstrap_1 = require("../telegram/bootstrap");
const logger_1 = require("../utils/logger");
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';
function safeEqual(a, b) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(bufA, bufB);
}
/** Verifies Telegram's shared secret header before any parsing/processing happens. */
function verifyTelegramWebhookSecret(req, res, next) {
    const provided = req.header(SECRET_HEADER);
    if (!config_1.telegramConfig.enabled || !provided || !safeEqual(provided, config_1.telegramConfig.webhookSecret)) {
        (0, logger_1.logEvent)('warn', { event: 'channel.webhook.rejected', requestId: req.correlationId, provider: 'telegram' });
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
async function telegramWebhook(req, res) {
    if (bootstrap_1.telegramService) {
        try {
            await bootstrap_1.telegramService.handleUpdate(req.body, req.correlationId);
        }
        catch {
            (0, logger_1.logEvent)('error', { event: 'channel.assistant.failed', requestId: req.correlationId, provider: 'telegram' });
        }
    }
    res.status(200).json({ ok: true });
}
//# sourceMappingURL=telegram.controller.js.map
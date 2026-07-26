"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadTelegramConfig = loadTelegramConfig;
const text = (value) => {
    const trimmed = value?.trim();
    return trimmed || undefined;
};
const truthy = (value) => {
    const v = text(value)?.toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
};
/**
 * Loads Telegram channel configuration. Mirrors the hand-rolled pattern in
 * src/config/assistant-provider.ts (no Zod in this repo). Never registers a
 * webhook at boot — see scripts/telegram-set-webhook.mjs for the deliberate,
 * operator-driven registration step.
 */
function loadTelegramConfig(env) {
    const enabled = truthy(env.TELEGRAM_ENABLED);
    if (!enabled) {
        return { enabled: false, botToken: null, webhookSecret: null, botUsername: null };
    }
    const botToken = text(env.TELEGRAM_BOT_TOKEN);
    const webhookSecret = text(env.TELEGRAM_WEBHOOK_SECRET);
    if (!botToken)
        throw new Error('TELEGRAM_BOT_TOKEN is required when TELEGRAM_ENABLED=true.');
    if (!webhookSecret)
        throw new Error('TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_ENABLED=true.');
    return { enabled: true, botToken, webhookSecret, botUsername: text(env.TELEGRAM_BOT_USERNAME) ?? null };
}
//# sourceMappingURL=config.js.map
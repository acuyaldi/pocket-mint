"use strict";
// ============================================================
// Telegram Bot API client — minimal typed fetch wrapper.
// ------------------------------------------------------------
// No SDK: this repo's needs (sendMessage, setWebhook, deleteWebhook,
// answerCallbackQuery, editMessageReplyMarkup) don't justify a dependency.
// Never logs the bot token or request/response bodies; never throws a raw
// SDK/fetch-shaped error upward — callers get a classified outcome. No
// arbitrary method proxy — only the fixed set of methods below.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTelegramClient = createTelegramClient;
const API_BASE = 'https://api.telegram.org';
function createTelegramClient(deps) {
    const doFetch = deps.fetchImpl ?? fetch;
    const base = `${API_BASE}/bot${deps.botToken}`;
    async function call(method, body, retried = false) {
        let response;
        try {
            response = await doFetch(`${base}/${method}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });
        }
        catch {
            return { ok: false, category: 'provider_unavailable' };
        }
        if (response.status === 429 && !retried) {
            let retryAfterSeconds = 1;
            try {
                const payload = (await response.json());
                retryAfterSeconds = payload.parameters?.retry_after ?? 1;
            }
            catch {
                // ignore, use default backoff
            }
            await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterSeconds, 5) * 1000));
            return call(method, body, true);
        }
        if (response.status === 429)
            return { ok: false, category: 'provider_rate_limit' };
        if (response.status >= 500)
            return { ok: false, category: 'provider_unavailable' };
        if (!response.ok)
            return { ok: false, category: 'provider_invalid_response' };
        try {
            const payload = (await response.json());
            return { ok: true, result: payload.result };
        }
        catch {
            return { ok: true, result: undefined };
        }
    }
    /** Bounded plain-text send, optionally with an inline keyboard. Telegram enforces a 4096-char message cap. */
    async function sendMessage(chatId, text, replyMarkup) {
        const outcome = await call('sendMessage', {
            chat_id: chatId,
            text,
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        });
        if (!outcome.ok)
            return outcome;
        const messageId = outcome.result?.message_id;
        return { ok: true, ...(messageId !== undefined ? { messageId: String(messageId) } : {}) };
    }
    /** Replaces (or clears, when `replyMarkup` is omitted) the inline keyboard on an already-sent message. */
    async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
        return call('editMessageReplyMarkup', {
            chat_id: chatId,
            message_id: Number(messageId),
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        });
    }
    /**
     * Synchronous, bounded callback acknowledgment. Not the authoritative
     * business result — must never claim success before the durable worker
     * executes. `text` should be neutral (e.g. "Processing…") or omitted.
     */
    async function answerCallbackQuery(callbackQueryId, text) {
        return call('answerCallbackQuery', {
            callback_query_id: callbackQueryId,
            ...(text ? { text } : {}),
        });
    }
    async function setWebhook(url, secretToken) {
        return call('setWebhook', { url, secret_token: secretToken, allowed_updates: ['message', 'callback_query'] });
    }
    async function deleteWebhook() {
        return call('deleteWebhook', {});
    }
    return { sendMessage, editMessageReplyMarkup, answerCallbackQuery, setWebhook, deleteWebhook };
}
//# sourceMappingURL=client.js.map
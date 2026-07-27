"use strict";
// ============================================================
// Telegram update schema — structural validation + allowlist.
// ------------------------------------------------------------
// Accepts only private-chat text messages. Everything else (edited messages,
// callback queries, channel posts, group/supergroup chats, non-text content,
// membership updates, inline queries, ...) is rejected here, before any
// business logic sees it. The raw Telegram update type never leaves this file
// plus envelope.ts.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTelegramUpdate = parseTelegramUpdate;
exports.parseTelegramCallbackQuery = parseTelegramCallbackQuery;
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
/** Returns the normalized private-text message, or null if the update is unsupported. */
function parseTelegramUpdate(raw) {
    if (!isRecord(raw))
        return null;
    const updateId = raw.update_id;
    if (typeof updateId !== 'number' && typeof updateId !== 'string')
        return null;
    const message = raw.message;
    if (!isRecord(message))
        return null; // rejects edited_message, callback_query, channel_post, my_chat_member, etc.
    const chat = message.chat;
    if (!isRecord(chat) || chat.type !== 'private')
        return null; // rejects group/supergroup/channel
    const from = message.from;
    if (!isRecord(from) || (typeof from.id !== 'number' && typeof from.id !== 'string'))
        return null;
    const text = message.text;
    if (typeof text !== 'string' || text.trim().length === 0)
        return null; // rejects photo/voice/location/etc.
    const chatId = chat.id;
    if (typeof chatId !== 'number' && typeof chatId !== 'string')
        return null;
    return {
        updateId: String(updateId),
        chatId: String(chatId),
        senderId: String(from.id),
        text,
    };
}
/**
 * Returns the normalized private-chat callback query, or null if the update
 * isn't a callback query, isn't bound to a private chat, or is missing the
 * opaque `data` handle. Bounded like `parseTelegramUpdate`: only these
 * allowlisted fields ever leave this file plus envelope.ts — nothing about
 * the pressed button's meaning is trusted from this payload.
 */
function parseTelegramCallbackQuery(raw) {
    if (!isRecord(raw))
        return null;
    const updateId = raw.update_id;
    if (typeof updateId !== 'number' && typeof updateId !== 'string')
        return null;
    const callbackQuery = raw.callback_query;
    if (!isRecord(callbackQuery))
        return null;
    const callbackQueryId = callbackQuery.id;
    if (typeof callbackQueryId !== 'string' || callbackQueryId.length === 0)
        return null;
    const data = callbackQuery.data;
    if (typeof data !== 'string' || data.length === 0 || data.length > 256)
        return null;
    const from = callbackQuery.from;
    if (!isRecord(from) || (typeof from.id !== 'number' && typeof from.id !== 'string'))
        return null;
    const message = callbackQuery.message;
    if (!isRecord(message))
        return null;
    const chat = message.chat;
    if (!isRecord(chat) || chat.type !== 'private')
        return null;
    const chatId = chat.id;
    if (typeof chatId !== 'number' && typeof chatId !== 'string')
        return null;
    const messageId = message.message_id;
    if (typeof messageId !== 'number' && typeof messageId !== 'string')
        return null;
    return {
        updateId: String(updateId),
        callbackQueryId,
        chatId: String(chatId),
        senderId: String(from.id),
        messageId: String(messageId),
        data,
    };
}
//# sourceMappingURL=schema.js.map
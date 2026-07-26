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
//# sourceMappingURL=schema.js.map
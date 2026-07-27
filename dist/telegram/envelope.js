"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTelegramUpdate = normalizeTelegramUpdate;
const schema_1 = require("./schema");
/** Normalizes a raw Telegram update into the canonical channel envelope, or null if unsupported. */
function normalizeTelegramUpdate(raw, receivedAt = new Date()) {
    const message = (0, schema_1.parseTelegramUpdate)(raw);
    if (message) {
        return {
            provider: 'TELEGRAM',
            externalUpdateId: message.updateId,
            externalChatId: message.chatId,
            externalSenderId: message.senderId,
            text: message.text,
            receivedAt,
            kind: 'MESSAGE',
        };
    }
    const callback = (0, schema_1.parseTelegramCallbackQuery)(raw);
    if (callback) {
        return {
            provider: 'TELEGRAM',
            externalUpdateId: callback.updateId,
            externalChatId: callback.chatId,
            externalSenderId: callback.senderId,
            text: callback.data,
            receivedAt,
            kind: 'CALLBACK',
            callbackQueryId: callback.callbackQueryId,
            callbackMessageId: callback.messageId,
        };
    }
    return null;
}
//# sourceMappingURL=envelope.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTelegramUpdate = normalizeTelegramUpdate;
const schema_1 = require("./schema");
/** Normalizes a raw Telegram update into the canonical channel envelope, or null if unsupported. */
function normalizeTelegramUpdate(raw, receivedAt = new Date()) {
    const parsed = (0, schema_1.parseTelegramUpdate)(raw);
    if (!parsed)
        return null;
    return {
        provider: 'TELEGRAM',
        externalUpdateId: parsed.updateId,
        externalChatId: parsed.chatId,
        externalSenderId: parsed.senderId,
        text: parsed.text,
        receivedAt,
    };
}
//# sourceMappingURL=envelope.js.map
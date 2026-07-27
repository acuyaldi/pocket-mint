import type { InboundChannelMessage } from '../channels/types';
import { parseTelegramUpdate, parseTelegramCallbackQuery } from './schema';

/** Normalizes a raw Telegram update into the canonical channel envelope, or null if unsupported. */
export function normalizeTelegramUpdate(raw: unknown, receivedAt: Date = new Date()): InboundChannelMessage | null {
  const message = parseTelegramUpdate(raw);
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

  const callback = parseTelegramCallbackQuery(raw);
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

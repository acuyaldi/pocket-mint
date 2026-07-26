import type { InboundChannelMessage } from '../channels/types';
import { parseTelegramUpdate } from './schema';

/** Normalizes a raw Telegram update into the canonical channel envelope, or null if unsupported. */
export function normalizeTelegramUpdate(raw: unknown, receivedAt: Date = new Date()): InboundChannelMessage | null {
  const parsed = parseTelegramUpdate(raw);
  if (!parsed) return null;
  return {
    provider: 'TELEGRAM',
    externalUpdateId: parsed.updateId,
    externalChatId: parsed.chatId,
    externalSenderId: parsed.senderId,
    text: parsed.text,
    receivedAt,
  };
}

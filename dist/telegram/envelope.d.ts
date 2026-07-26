import type { InboundChannelMessage } from '../channels/types';
/** Normalizes a raw Telegram update into the canonical channel envelope, or null if unsupported. */
export declare function normalizeTelegramUpdate(raw: unknown, receivedAt?: Date): InboundChannelMessage | null;

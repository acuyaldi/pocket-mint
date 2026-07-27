export interface TelegramPrivateTextMessage {
    readonly updateId: string;
    readonly chatId: string;
    readonly senderId: string;
    readonly text: string;
}
/** A private-chat inline-keyboard button press. `data` is our own opaque callback handle, never a domain identifier. */
export interface TelegramPrivateCallbackQuery {
    readonly updateId: string;
    readonly callbackQueryId: string;
    readonly chatId: string;
    readonly senderId: string;
    readonly messageId: string;
    readonly data: string;
}
/** Returns the normalized private-text message, or null if the update is unsupported. */
export declare function parseTelegramUpdate(raw: unknown): TelegramPrivateTextMessage | null;
/**
 * Returns the normalized private-chat callback query, or null if the update
 * isn't a callback query, isn't bound to a private chat, or is missing the
 * opaque `data` handle. Bounded like `parseTelegramUpdate`: only these
 * allowlisted fields ever leave this file plus envelope.ts — nothing about
 * the pressed button's meaning is trusted from this payload.
 */
export declare function parseTelegramCallbackQuery(raw: unknown): TelegramPrivateCallbackQuery | null;

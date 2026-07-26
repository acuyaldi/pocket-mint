export interface TelegramPrivateTextMessage {
    readonly updateId: string;
    readonly chatId: string;
    readonly senderId: string;
    readonly text: string;
}
/** Returns the normalized private-text message, or null if the update is unsupported. */
export declare function parseTelegramUpdate(raw: unknown): TelegramPrivateTextMessage | null;

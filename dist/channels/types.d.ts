export type ChannelProviderName = 'TELEGRAM';
export interface InboundChannelMessage {
    readonly provider: ChannelProviderName;
    readonly externalUpdateId: string;
    readonly externalChatId: string;
    readonly externalSenderId: string;
    /** For a CALLBACK update, this is the opaque callback-data handle, not user text. */
    readonly text: string;
    readonly receivedAt: Date;
    readonly kind?: 'MESSAGE' | 'CALLBACK';
    /** CALLBACK only — kept for answerCallbackQuery diagnostics, never an authorization credential. */
    readonly callbackQueryId?: string;
    /** CALLBACK only — the message the pressed inline keyboard is attached to. */
    readonly callbackMessageId?: string;
}
export interface OutboundChannelMessage {
    readonly text: string;
}

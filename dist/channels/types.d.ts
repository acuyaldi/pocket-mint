export type ChannelProviderName = 'TELEGRAM';
export interface InboundChannelMessage {
    readonly provider: ChannelProviderName;
    readonly externalUpdateId: string;
    readonly externalChatId: string;
    readonly externalSenderId: string;
    readonly text: string;
    readonly receivedAt: Date;
}
export interface OutboundChannelMessage {
    readonly text: string;
}

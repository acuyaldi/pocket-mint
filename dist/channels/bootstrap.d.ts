export declare const channelLinkTokenService: {
    createLinkToken: (userId: string, provider: import("./types").ChannelProviderName) => Promise<{
        token: string;
        expiresAt: Date;
    }>;
    consumeLinkToken: (rawToken: string, provider: import("./types").ChannelProviderName, externalUserId: string, externalChatId: string) => Promise<{
        userId: string;
        connectionId: string;
    }>;
};
export declare const channelConnectionService: {
    getActiveConnection: (provider: import("./types").ChannelProviderName, externalUserId: string) => Promise<import("./connection.service").ChannelConnectionSummary | null>;
    getByUser: (userId: string, provider: import("./types").ChannelProviderName) => Promise<import("./connection.service").ChannelConnectionSummary | null>;
    revoke: (userId: string, provider: import("./types").ChannelProviderName) => Promise<void>;
    setCurrentConversation: (connectionId: string, conversationId: string | null) => Promise<void>;
};
export declare const channelInboundWorker: {
    pollOnce: () => Promise<number>;
} | undefined;
export declare const channelOutboundWorker: {
    pollOnce: () => Promise<number>;
} | undefined;

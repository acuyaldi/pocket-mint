export declare class ChannelError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly isOperational = true;
    private constructor();
    static webhookAuthFailed(): ChannelError;
    static unsupportedUpdate(): ChannelError;
    static unlinkedIdentity(): ChannelError;
    static linkInvalidOrExpired(): ChannelError;
    static linkIdentityConflict(): ChannelError;
    static connectionRevoked(): ChannelError;
    static providerUnavailable(): ChannelError;
}

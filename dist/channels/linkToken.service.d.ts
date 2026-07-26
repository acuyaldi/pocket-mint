import type { PrismaClient } from '../generated/prisma/client';
import type { ChannelProviderName } from './types';
export declare const CHANNEL_LINK_TOKEN_TTL_MS: number;
export declare function createChannelLinkTokenService(db: PrismaClient, clock?: () => Date): {
    createLinkToken: (userId: string, provider: ChannelProviderName) => Promise<{
        token: string;
        expiresAt: Date;
    }>;
    consumeLinkToken: (rawToken: string, provider: ChannelProviderName, externalUserId: string, externalChatId: string) => Promise<{
        userId: string;
        connectionId: string;
    }>;
};
export type ChannelLinkTokenService = ReturnType<typeof createChannelLinkTokenService>;

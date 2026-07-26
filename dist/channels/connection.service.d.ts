import type { PrismaClient } from '../generated/prisma/client';
import type { ChannelProviderName } from './types';
export interface ChannelConnectionSummary {
    readonly id: string;
    readonly userId: string;
    readonly conversationId: string | null;
    readonly status: 'ACTIVE' | 'REVOKED';
    readonly linkedAt: Date;
}
export declare function createChannelConnectionService(db: PrismaClient): {
    getActiveConnection: (provider: ChannelProviderName, externalUserId: string) => Promise<ChannelConnectionSummary | null>;
    getByUser: (userId: string, provider: ChannelProviderName) => Promise<ChannelConnectionSummary | null>;
    revoke: (userId: string, provider: ChannelProviderName) => Promise<void>;
    setCurrentConversation: (connectionId: string, conversationId: string | null) => Promise<void>;
};
export type ChannelConnectionService = ReturnType<typeof createChannelConnectionService>;

import type { PrismaClient } from '../generated/prisma/client';
import type { ChannelLinkTokenService } from '../channels/linkToken.service';
import type { ChannelConnectionService } from '../channels/connection.service';
import type { TelegramClient } from './client';
import type { AssistantProviderRuntime } from '../assistant/provider-runtime';
export interface TelegramServiceDeps {
    readonly db: PrismaClient;
    readonly linkTokens: ChannelLinkTokenService;
    readonly connections: ChannelConnectionService;
    readonly client: TelegramClient;
    readonly assistantProviderRuntime?: AssistantProviderRuntime;
}
export declare function createTelegramService(deps: TelegramServiceDeps): {
    handleUpdate: (rawUpdate: unknown, correlationId: string) => Promise<void>;
};
export type TelegramService = ReturnType<typeof createTelegramService>;

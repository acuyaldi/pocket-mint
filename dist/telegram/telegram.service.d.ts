import type { PrismaClient } from '../generated/prisma/client';
import type { ChannelConnectionService } from '../channels/connection.service';
export interface TelegramServiceDeps {
    readonly db: PrismaClient;
    readonly connections: ChannelConnectionService;
}
/**
 * Webhook-facing entry point. Performs ONLY bounded transport work: parse,
 * classify, resolve identity (read-only), and durably persist the update as a
 * ChannelInboundJob before returning — see docs/product/decisions/015. Never
 * invokes the Assistant or Telegram delivery; that happens in the inbound/
 * outbound workers (src/channels/workers/), independently of webhook latency.
 */
export declare function createTelegramService(deps: TelegramServiceDeps): {
    handleUpdate: (rawUpdate: unknown, correlationId: string) => Promise<void>;
};
export type TelegramService = ReturnType<typeof createTelegramService>;

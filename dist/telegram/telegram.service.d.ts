import type { PrismaClient } from '../generated/prisma/client';
import type { ChannelConnectionService } from '../channels/connection.service';
import type { TelegramClient } from './client';
export interface TelegramServiceDeps {
    readonly db: PrismaClient;
    readonly connections: ChannelConnectionService;
    readonly client: TelegramClient;
}
/**
 * Webhook-facing entry point. Performs ONLY bounded transport work: parse,
 * classify, resolve identity (read-only), durably persist the update as a
 * ChannelInboundJob, and — for a callback query — synchronously acknowledge
 * it. Never invokes the Assistant, never resolves clarification/draft
 * ownership, never edits the Telegram message, never waits on the durable
 * worker; that happens in the inbound/outbound workers (src/channels/workers/)
 * independently of webhook latency. See docs/product/decisions/015.
 *
 * A failure to acknowledge the callback (network hiccup, Telegram error) must
 * not undo durable inbound acceptance — the job was already committed above,
 * so `answerCallbackQuery` failure here is swallowed and only logged; the
 * durable worker still processes the job normally (Telegram may show the
 * user a spinner timeout, but retrying the same update is deduplicated and
 * the underlying action still executes at most once).
 */
export declare function createTelegramService(deps: TelegramServiceDeps): {
    handleUpdate: (rawUpdate: unknown, correlationId: string) => Promise<void>;
};
export type TelegramService = ReturnType<typeof createTelegramService>;

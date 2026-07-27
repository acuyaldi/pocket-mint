import type { PrismaClient } from '../generated/prisma/client';
import type { AssistantProviderRuntime } from '../assistant/provider-runtime';
import type { ClaimedInboundJob } from './workers/claim';
import type { CallbackActionResult } from './interaction.types';
export interface ChannelInteractionDeps {
    readonly db: PrismaClient;
    readonly providerRuntime: AssistantProviderRuntime;
}
/**
 * Interprets an AssistantApplicationResult (from a callback-driven
 * clarification select/cancel, OR the very first message-path Assistant
 * turn) into a bounded interaction result, chaining a new keyboard when the
 * result unlocked a further clarification or draft. Exported so the
 * inbound-message worker can render buttons for a fresh Assistant turn too,
 * not only for callback follow-ups.
 */
export declare function renderApplicationResult(db: PrismaClient, connectionId: string, conversationId: string, result: {
    readonly response: unknown;
}): Promise<CallbackActionResult>;
/**
 * The single entry point for a CALLBACK job. Re-derives every piece of
 * ownership server-side before calling any authoritative service, and
 * atomically claims the callback token as the race gate between two
 * independent button presses on the same token (mirrors the Persistent
 * Clarification Engine's own PENDING->CONSUMED claim).
 */
export declare function processCallback(deps: ChannelInteractionDeps, job: ClaimedInboundJob, correlationId: string): Promise<CallbackActionResult>;

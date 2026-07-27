import type { PrismaClient } from '../generated/prisma/client';
export declare const CALLBACK_TOKEN_TTL_MS: number;
export type ChannelCallbackInteractionType = 'CLARIFICATION_SELECT' | 'CLARIFICATION_CANCEL' | 'DRAFT_CONFIRM' | 'DRAFT_CANCEL';
export interface CreateCallbackTokenInput {
    readonly connectionId: string;
    readonly conversationId: string;
    readonly interactionType: ChannelCallbackInteractionType;
    readonly clarificationRequestId?: string;
    readonly clarificationOptionId?: string;
    readonly financialDraftId?: string;
    /** Server-side-only; never returned alongside the plaintext token. */
    readonly actionSecret?: string;
}
/** Creates a token row and returns its plaintext once — the only value that ever goes into Telegram callback_data. */
export declare function createCallbackToken(db: PrismaClient, input: CreateCallbackTokenInput): Promise<{
    id: string;
    token: string;
}>;
/** Digest lookup only — the raw callback_data handle is never trusted as anything but a lookup key. */
export declare function findCallbackTokenByRaw(db: PrismaClient, rawToken: string): import("@/generated/prisma").Prisma.Prisma__ChannelCallbackTokenClient<{
    provider: import("@/generated/prisma").$Enums.ChannelProvider;
    interactionType: import("@/generated/prisma").$Enums.ChannelCallbackInteractionType;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: import("@/generated/prisma").$Enums.ChannelCallbackTokenStatus;
    conversationId: string;
    expiresAt: Date;
    consumedAt: Date | null;
    tokenDigest: string;
    connectionId: string;
    clarificationRequestId: string | null;
    clarificationOptionId: string | null;
    financialDraftId: string | null;
    actionSecret: string | null;
} | null, null, import("@/generated/prisma/runtime/client").DefaultArgs, import("@/generated/prisma").Prisma.PrismaClientOptions>;
/**
 * Atomic one-time claim — the actual concurrency guard between two
 * independent button presses on the same token (mirrors ClarificationRequest's
 * PENDING->CONSUMED conditional update). Clears `actionSecret` on success.
 */
export declare function claimCallbackToken(db: PrismaClient, id: string): Promise<boolean>;
/** Lazy terminalization on read, mirroring ClarificationRequest's expiry-on-read pattern. */
export declare function expireCallbackToken(db: PrismaClient, id: string): Promise<void>;
export declare function staleCallbackToken(db: PrismaClient, id: string): Promise<void>;

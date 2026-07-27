import { type PrismaClient } from '../../generated/prisma/client';
export interface ClaimedInboundJob {
    readonly id: string;
    readonly provider: string;
    readonly externalUpdateId: string;
    readonly channelConnectionId: string | null;
    readonly externalSenderId: string;
    readonly externalChatId: string;
    readonly text: string;
    readonly kind: 'MESSAGE' | 'CALLBACK';
    readonly callbackQueryId: string | null;
    readonly callbackMessageId: string | null;
    readonly attempt: number;
    readonly assistantTurnId: string | null;
}
export interface ClaimedDelivery {
    readonly id: string;
    readonly inboundJobId: string;
    readonly kind: 'SEND_MESSAGE' | 'EDIT_REPLY_MARKUP' | 'ANSWER_CALLBACK';
    readonly destinationChatId: string;
    readonly renderedText: string;
    readonly replyMarkup: unknown;
    readonly targetMessageId: string | null;
    readonly attempt: number;
}
export interface ClaimOptions {
    readonly batchSize: number;
    readonly leaseMs: number;
    readonly owner: string;
}
/**
 * Claims a bounded batch of eligible jobs atomically via `FOR UPDATE SKIP
 * LOCKED` so concurrent worker instances never claim the same row — this
 * transaction commits immediately (no network/Assistant call happens inside
 * it). `attempt > 1` on the returned row signals a reclaimed (previously
 * leased) job rather than a first attempt.
 */
export declare function claimInboundJobs(db: PrismaClient, opts: ClaimOptions): Promise<ClaimedInboundJob[]>;
export declare function claimOutboundDeliveries(db: PrismaClient, opts: ClaimOptions): Promise<ClaimedDelivery[]>;

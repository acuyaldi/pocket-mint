import type { PrismaClient } from '../../generated/prisma/client';
export type OperationBeginResult = {
    readonly status: 'new';
} | {
    readonly status: 'replay';
    readonly turnId: string;
    readonly renderedText: string;
}
/** A prior attempt on this exact job started but crashed before recording a turn — cannot safely tell whether the Assistant (and any financial mutation) actually ran. Fails safe: caller must not retry the Assistant call. */
 | {
    readonly status: 'ambiguous';
};
export declare function channelOperationId(provider: string, inboundJobId: string): string;
/**
 * Operation-identity guard binding one inbound job to at most one Assistant
 * turn (see docs/product/decisions/015 — the Assistant module itself has no
 * request-level idempotency contract, so this lives entirely in the channel
 * layer instead of touching it). Insert-first-wins: a conflict means a
 * previous attempt on this exact job already started.
 */
export declare function beginAssistantOperation(db: PrismaClient, operationId: string, userId: string): Promise<OperationBeginResult>;
export declare function completeAssistantOperation(db: PrismaClient, operationId: string, turnId: string, renderedText: string): Promise<void>;
export type CallbackOperationBeginResult = {
    readonly status: 'new';
} | {
    readonly status: 'replay';
    readonly terminalStatus: string;
    readonly renderedText: string;
}
/** A prior attempt crashed before recording a terminal result — fails safe: caller must not repeat the callback action. */
 | {
    readonly status: 'ambiguous';
};
/**
 * Same insert-first-wins operation-identity guard as `beginAssistantOperation`,
 * but for a CALLBACK_INTERACTION — never an Assistant turn. One inbound
 * callback job maps to at most one interaction operation.
 */
export declare function beginCallbackOperation(db: PrismaClient, operationId: string, userId: string, callbackTokenId: string | null): Promise<CallbackOperationBeginResult>;
export declare function completeCallbackOperation(db: PrismaClient, operationId: string, terminalStatus: string, renderedText: string): Promise<void>;

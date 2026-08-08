import { Prisma, type PrismaClient } from '../generated/prisma/client';
import type { TransactionService } from '../services/transaction.service';
import type { TransactionCreateInput } from './tools';
type DraftReadyTransactionInput = TransactionCreateInput & {
    walletId: string;
    categoryId: string;
    date: string;
};
/** Fields the user may override when confirming a draft. All optional — missing fields use the draft's original values. */
export interface DraftConfirmOverride {
    amount?: number;
    walletId?: string;
    categoryId?: string;
    description?: string;
    /** YYYY-MM-DD in the user's reporting timezone. */
    date?: string;
}
/**
 * Row shape needed by `confirm()` to merge overrides — a subset of the full
 * `AssistantFinancialDraft` row.
 */
export interface DraftRowForValidation {
    transactionType: string;
    amount: Prisma.Decimal;
    walletId: string;
    categoryId: string;
    transactionDate: Date;
    description: string | null;
}
export declare function createAssistantFinancialDraftService(db: PrismaClient, transactions: TransactionService, deps?: (() => {
    inferCategoryId?: (userId: string, type: 'INCOME' | 'EXPENSE', hint: string | undefined, tx?: Prisma.TransactionClient) => Promise<string | undefined>;
}) | {
    inferCategoryId?: (userId: string, type: 'INCOME' | 'EXPENSE', hint: string | undefined, tx?: Prisma.TransactionClient) => Promise<string | undefined>;
}, clock?: () => Date): {
    prepare: (input: DraftReadyTransactionInput & {
        walletDisplayLabel?: string;
        merchantDisplayLabel?: string;
        userId: string;
        conversationId: string;
        turnId: string;
        executionId: string;
        now?: Date;
        transaction?: Prisma.TransactionClient;
    }) => Promise<{
        draftId: string;
        status: import("@/generated/prisma").$Enums.AssistantFinancialDraftStatus;
        expiresAt: Date;
        preview: {
            description?: string | undefined;
            date: string;
            merchant?: string | undefined;
            category: string;
            walletId: string;
            type: "INCOME" | "EXPENSE";
            amount: string;
        } | {
            description?: string | undefined;
            date: string;
            merchant?: string | undefined;
            category: string;
            wallet: string;
            type: "INCOME" | "EXPENSE";
            amount: string;
        };
        confirmationRequired: boolean;
        renderedText: string;
    }>;
    confirm: (userId: string, draftId: string, keyValue: unknown, correlationId: string, overrides?: DraftConfirmOverride) => Promise<{
        idempotencyOutcome: "replay";
        draftId: string;
        status: "COMMITTED";
        transactionId: string;
        conversationId: string;
        readonly error?: undefined;
        turnId?: undefined;
    } | {
        draftId: string;
        status: "COMMITTED";
        transactionId: string;
        conversationId: string;
        turnId: string;
        idempotencyOutcome: "new";
        readonly error?: undefined;
    }>;
    cancel: (userId: string, draftId: string, correlationId: string) => Promise<{
        turnId?: string | undefined;
        draftId: string;
        status: "CANCELLED";
        conversationId: string;
    } | {
        draftId: string;
        status: "EXPIRED";
        conversationId: string;
    }>;
};
export type AssistantFinancialDraftService = ReturnType<typeof createAssistantFinancialDraftService>;
export {};

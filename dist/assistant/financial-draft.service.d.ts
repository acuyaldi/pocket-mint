import { Prisma, type PrismaClient } from '../generated/prisma/client';
import type { TransactionService } from '../services/transaction.service';
import type { TransactionCreateInput } from './tools';
type DraftReadyTransactionInput = TransactionCreateInput & {
    walletId: string;
    categoryId: string;
    date: string;
};
export declare function createAssistantFinancialDraftService(db: PrismaClient, transactions: TransactionService, clock?: () => Date): {
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
    confirm: (userId: string, draftId: string, keyValue: unknown, correlationId: string) => Promise<{
        idempotencyOutcome: "replay";
        draftId: string;
        status: "COMMITTED";
        transactionId: string;
        conversationId: string;
        renderedText: string;
        readonly error?: undefined;
        turnId?: undefined;
    } | {
        draftId: string;
        status: "COMMITTED";
        transactionId: string;
        conversationId: string;
        turnId: string;
        renderedText: string;
        idempotencyOutcome: "new";
        readonly error?: undefined;
    }>;
    cancel: (userId: string, draftId: string, correlationId: string) => Promise<{
        renderedText: string;
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

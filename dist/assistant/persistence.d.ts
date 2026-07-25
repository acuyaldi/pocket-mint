import type { Prisma } from '../generated/prisma/client';
export declare const MAX_ASSISTANT_MESSAGE_LENGTH = 10000;
export declare const SAFE_REJECTED_INTENT = "unresolved";
export declare function assertAssistantMessageLength(content: string): string;
export declare function normalizeProvidedMessage(value: unknown): string | undefined;
export declare function safeRejectedUserMessage(): string;
export declare function safeRejectedAssistantMessage(code: string): string;
export declare function monthlySummaryFallback(input: {
    month: string;
}): string;
export declare function monthlySummaryInputForAudit(input: {
    month: string;
}): Prisma.InputJsonObject;
export declare function monthlySummaryOutputForAudit(output: {
    month: string;
    transactionCount: number;
    topCategories: unknown[];
}): Prisma.InputJsonObject;

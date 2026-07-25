import type { PrismaClient, Prisma } from '../generated/prisma/client';
import type { BeginTurnInput, BeginTurnResult, ConversationMessageDto, ConversationSummaryDto, FinalizeToolInput, FinalizeWithoutToolInput, Page } from './conversation.types';
export declare function createAssistantConversationService(db: PrismaClient): {
    assertContinuable: (userId: string, id: string) => Promise<void>;
    establishConversation: (userId: string, conversationId: string | undefined, locale: string) => Promise<string>;
    beginTurn: (input: BeginTurnInput) => Promise<BeginTurnResult>;
    markTurnRunning: (turnId: string) => Promise<void>;
    beginToolExecution: (input: {
        conversationId: string;
        turnId: string;
        correlationId: string;
        toolId: string;
        capability: string;
        riskLevel: string;
        policyDecision: string;
        redactedInput?: Prisma.InputJsonValue;
    }) => Promise<string>;
    finalize: (input: FinalizeToolInput) => Promise<void>;
    finalizeRejected: (input: BeginTurnResult & {
        content: string;
        safeErrorCode: string;
    }) => Promise<void>;
    finalizeWithoutTool: (input: FinalizeWithoutToolInput) => Promise<void>;
    listOwnedConversations: (userId: string, page?: number, limit?: number) => Promise<Page<ConversationSummaryDto>>;
    getOwnedConversation: (userId: string, id: string, page?: number, limit?: number) => Promise<{
        conversation: {
            id: string;
            status: import("@/generated/prisma").$Enums.AssistantConversationStatus;
            locale: string;
            createdAt: Date;
            updatedAt: Date;
            lastActivityAt: Date;
        };
        messages: {
            items: ConversationMessageDto[];
            page: number;
            limit: number;
            total: number;
            hasMore: boolean;
        };
        turns: {
            id: string;
            status: import("@/generated/prisma").$Enums.AssistantTurnStatus;
            correlationId: string;
            startedAt: Date;
            safeErrorCode: string | null;
            intent: string;
            finishedAt: Date | null;
            toolExecutions: {
                id: string;
                status: import("@/generated/prisma").$Enums.AssistantToolExecutionStatus;
                correlationId: string;
                startedAt: Date;
                completedAt: Date | null;
                durationMs: number | null;
                safeErrorCode: string | null;
                toolId: string;
                capability: string;
                riskLevel: string;
                policyDecision: string;
            }[];
        }[];
    }>;
    archiveOwnedConversation: (userId: string, id: string) => Promise<{
        id: string;
        status: import("@/generated/prisma").$Enums.AssistantConversationStatus;
        archivedAt: Date | null;
    }>;
};
export type AssistantConversationService = ReturnType<typeof createAssistantConversationService>;

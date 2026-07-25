import { ToolRegistry } from './registry';
import type { HandlerRegistry } from './executor';
import { EntityResolverRegistry } from './entity-resolution';
/** The application-wide tool registry. Populated at startup. */
export declare const toolRegistry: ToolRegistry;
/** The application-wide handler registry. Populated at startup. */
export declare const handlerRegistry: HandlerRegistry;
export declare const entityResolverRegistry: EntityResolverRegistry;
export declare const assistantConversationService: {
    assertContinuable: (userId: string, id: string) => Promise<void>;
    establishConversation: (userId: string, conversationId: string | undefined, locale: string) => Promise<string>;
    beginTurn: (input: import("./conversation.types").BeginTurnInput) => Promise<import("./conversation.types").BeginTurnResult>;
    markTurnRunning: (turnId: string) => Promise<void>;
    beginToolExecution: (input: {
        conversationId: string;
        turnId: string;
        correlationId: string;
        toolId: string;
        capability: string;
        riskLevel: string;
        policyDecision: string;
        redactedInput?: import("@/generated/prisma/runtime/client").InputJsonValue;
    }) => Promise<string>;
    finalize: (input: import("./conversation.types").FinalizeToolInput, options?: {
        transaction?: import("@/generated/prisma").Prisma.TransactionClient;
    }) => Promise<void>;
    finalizeRejected: (input: import("./conversation.types").BeginTurnResult & {
        content: string;
        safeErrorCode: string;
    }) => Promise<void>;
    finalizeWithoutTool: (input: import("./conversation.types").FinalizeWithoutToolInput, options?: {
        transaction?: import("@/generated/prisma").Prisma.TransactionClient;
    }) => Promise<void>;
    listOwnedConversations: (userId: string, page?: number, limit?: number) => Promise<import("./conversation.types").Page<import("./conversation.types").ConversationSummaryDto>>;
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
            items: import("./conversation.types").ConversationMessageDto[];
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
export declare const assistantContextService: {
    buildExecutionContext: (input: import("./context.service").BuildAssistantExecutionContextInput) => Promise<import("./context.types").AssistantContext>;
};
export declare const assistantFinancialDraftService: {
    prepare: (input: import("./tools").TransactionCreateInput & {
        walletDisplayLabel?: string;
        merchantDisplayLabel?: string;
        userId: string;
        conversationId: string;
        turnId: string;
        executionId: string;
        now?: Date;
        transaction?: import("@/generated/prisma").Prisma.TransactionClient;
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
        draftId: string;
        status: "COMMITTED";
        transactionId: string;
        conversationId: string;
        renderedText: string;
    } | {
        draftId: string;
        status: "COMMITTED";
        transactionId: string;
        conversationId: string;
        turnId: string;
        renderedText: string;
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
export declare const entityResolutionService: import("./entity-resolution").EntityResolutionService;
export declare const clarificationService: {
    create: (input: import("./clarification.types").CreateClarificationInput, options?: import("./clarification.service").TransactionOption) => Promise<import("./clarification.types").ClarificationCreationProjection>;
    select: (input: import("./clarification.types").SelectClarificationInput, options?: import("./clarification.service").TransactionOption) => Promise<import("./clarification.types").SelectClarificationResult>;
    cancel: (input: import("./clarification.types").CancelClarificationInput, options?: import("./clarification.service").TransactionOption) => Promise<void>;
    getAssistantState: (userId: string, conversationId: string) => Promise<import("./clarification.types").AssistantStateProjection>;
    buildConsumedResult: (consumedClarificationId: string) => Pick<import("./clarification.types").ClarificationAdvanceResult, "consumedClarificationId">;
    runInTransaction: <T>(work: (tx: import("./clarification.service").TransactionClient) => Promise<T>, existing?: import("./clarification.service").TransactionClient) => Promise<T>;
    _digestToken: (token: string) => string;
    _generateToken: () => string;
};
export declare const assistantApplicationService: {
    execute: (userId: string, correlationId: string, request: import("./types").AssistantCanonicalRequest) => Promise<import("./application.service").AssistantApplicationResult>;
    prepareProviderExecution: (input: import("./context.service").BuildAssistantExecutionContextInput) => Promise<import("./context.types").AssistantContext>;
    selectClarification: (userId: string, correlationId: string, token: string, conversationId: string, clarificationId?: string) => Promise<import("./application.service").AssistantApplicationResult>;
    cancelClarification: (userId: string, correlationId: string, clarificationId: string, conversationId: string) => Promise<import("./application.service").AssistantApplicationResult>;
    getAssistantState: (userId: string, conversationId: string) => Promise<import("./clarification.types").AssistantStateProjection>;
};
export declare const assistantProviderAuditService: import("./provider-runtime").AssistantProviderAudit;
export declare const assistantProviderRuntime: {
    sendMessage: (userId: string, correlationId: string, input: import("./provider-runtime").AssistantProviderMessageInput) => Promise<import("./provider-runtime").AssistantProviderRuntimeResult>;
} | undefined;

import type { AssistantApplicationService, AssistantApplicationResult } from './application.service';
import type { AssistantConversationService } from './conversation.service';
import type { AssistantFinancialDraftService } from './financial-draft.service';
import { type AssistantModelProvider, type AssistantProviderUsage } from './provider-types';
import type { ToolRegistry } from './registry';
export interface AssistantProviderAudit {
    begin(input: {
        userId: string;
        conversationId: string;
        correlationId: string;
        provider: string;
        model: string;
        inputBytes: number;
    }): Promise<string>;
    finalize(id: string, input: {
        status: 'PLAN_ACCEPTED' | 'CLARIFICATION' | 'UNSUPPORTED' | 'FAILED';
        turnId?: string;
        durationMs: number;
        outputBytes?: number;
        finishClassification?: string;
        safeErrorCode?: string;
        usage?: AssistantProviderUsage;
    }): Promise<void>;
}
export interface AssistantProviderMessageInput {
    readonly conversationId?: string;
    readonly message: string;
    readonly locale?: string;
}
export interface AssistantProviderRuntimeResult {
    readonly httpStatus: number;
    readonly response: AssistantApplicationResult['response'] | {
        readonly status: 'unsupported';
        readonly message: string;
        readonly correlationId: string;
        readonly conversationId: string;
        readonly turnId: string;
    };
}
interface RuntimeDependencies {
    application: AssistantApplicationService;
    conversations: AssistantConversationService;
    financialDrafts: AssistantFinancialDraftService;
    provider: AssistantModelProvider;
    audit: AssistantProviderAudit;
    toolRegistry: ToolRegistry;
    timeoutMs: number;
}
export declare function createAssistantProviderRuntime(deps: RuntimeDependencies): {
    sendMessage: (userId: string, correlationId: string, input: AssistantProviderMessageInput) => Promise<AssistantProviderRuntimeResult>;
    selectClarification: (userId: string, correlationId: string, token: string, conversationId: string, clarificationId?: string) => Promise<AssistantApplicationResult>;
    cancelClarification: (userId: string, correlationId: string, clarificationId: string, conversationId: string) => Promise<AssistantApplicationResult>;
    confirmDraft: (userId: string, draftId: string, idempotencyKey: string, correlationId: string) => Promise<{
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
    cancelDraft: (userId: string, draftId: string, correlationId: string) => Promise<{
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
    getAssistantState: (userId: string, conversationId: string) => Promise<import("./clarification.types").AssistantStateProjection>;
};
export type AssistantProviderRuntime = ReturnType<typeof createAssistantProviderRuntime>;
export {};

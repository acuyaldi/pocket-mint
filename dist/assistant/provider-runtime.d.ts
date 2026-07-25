import type { AssistantApplicationService, AssistantApplicationResult } from './application.service';
import type { AssistantConversationService } from './conversation.service';
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
    provider: AssistantModelProvider;
    audit: AssistantProviderAudit;
    toolRegistry: ToolRegistry;
    timeoutMs: number;
}
export declare function createAssistantProviderRuntime(deps: RuntimeDependencies): {
    sendMessage: (userId: string, correlationId: string, input: AssistantProviderMessageInput) => Promise<AssistantProviderRuntimeResult>;
};
export type AssistantProviderRuntime = ReturnType<typeof createAssistantProviderRuntime>;
export {};

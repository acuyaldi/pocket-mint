import { type HandlerRegistry } from './executor';
import type { ToolRegistry } from './registry';
import type { AssistantCanonicalRequest, AssistantCanonicalResponse } from './types';
import type { AssistantConversationService } from './conversation.service';
import type { AssistantFinancialDraftService } from './financial-draft.service';
import type { AssistantContextService, BuildAssistantExecutionContextInput } from './context.service';
import { type EntityResolutionService } from './entity-resolution';
import type { ClarificationService } from './clarification.service';
import type { Prisma } from '../generated/prisma/client';
import type { CategorySuggestion } from '../domain/categorization';
type TxClient = Prisma.TransactionClient;
export interface AssistantApplicationResult {
    response: AssistantCanonicalResponse;
    httpStatus: number;
}
export declare function createAssistantApplicationService(deps: {
    conversations: AssistantConversationService;
    contexts?: AssistantContextService;
    toolRegistry: ToolRegistry;
    handlerRegistry: HandlerRegistry;
    financialDrafts?: AssistantFinancialDraftService;
    entityResolution?: EntityResolutionService;
    clarification?: ClarificationService;
    /** Deterministic keyword/merchant-mapping category suggestion (owner-scoped). */
    categorization?: {
        getSuggestions(userId: string, description: string, type: 'INCOME' | 'EXPENSE', options?: {
            transaction?: TxClient;
        }): Promise<readonly CategorySuggestion[]>;
    };
}): {
    execute: (userId: string, correlationId: string, request: AssistantCanonicalRequest) => Promise<AssistantApplicationResult>;
    prepareProviderExecution: (input: BuildAssistantExecutionContextInput) => Promise<import("./context.types").AssistantContext>;
    selectClarification: (userId: string, correlationId: string, token: string, conversationId: string, clarificationId?: string) => Promise<AssistantApplicationResult>;
    submitGuidedClarification: (userId: string, correlationId: string, fields: Record<string, unknown>, conversationId: string, clarificationId: string) => Promise<AssistantApplicationResult>;
    cancelClarification: (userId: string, correlationId: string, clarificationId: string, conversationId: string) => Promise<AssistantApplicationResult>;
    getAssistantState: (userId: string, conversationId: string) => Promise<import("./clarification.types").AssistantStateProjection>;
    inferCategoryId: (userId: string, type: "INCOME" | "EXPENSE", hint: string | undefined, transaction?: TxClient) => Promise<string | undefined>;
};
export type AssistantApplicationService = ReturnType<typeof createAssistantApplicationService>;
export {};

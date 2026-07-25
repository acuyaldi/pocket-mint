export interface AssistantContextLimits {
    readonly messages: number;
    readonly turns: number;
    readonly toolExecutions: number;
    readonly pendingDrafts: number;
    readonly maxSerializedBytes: number;
}
export interface MessageContext {
    readonly role: 'USER' | 'ASSISTANT';
    readonly content: string;
    readonly source: string;
    readonly timestamp?: string;
}
export interface TurnContext {
    readonly status: string;
    readonly timestamp: string;
    readonly messages: readonly MessageContext[];
}
export interface ConversationContext {
    readonly conversationId: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly archived: boolean;
}
export interface DraftContext {
    readonly draftId: string;
    readonly operation: string;
    readonly status: string;
    readonly preview: {
        readonly type: string;
        readonly amount: string;
        readonly date: string;
        readonly description?: string;
    };
    readonly expiresAt: string;
    readonly confirmationRequired: true;
}
export interface ToolExecutionContext {
    readonly tool: string;
    readonly status: string;
    readonly timestamp: string;
    readonly safeOutputSummary?: unknown;
}
export interface AssistantContext {
    readonly system: {
        readonly contextVersion: '1';
        readonly locale: string;
    };
    readonly conversation: ConversationContext;
    readonly turns: readonly TurnContext[];
    readonly toolExecutions: readonly ToolExecutionContext[];
    readonly pendingDraft?: DraftContext;
    readonly currentRequest: MessageContext & {
        readonly role: 'USER';
        readonly source: 'CURRENT_REQUEST';
        readonly timestamp?: never;
    };
}
export interface ContextConversationRow {
    id: string;
    status: string;
    locale: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface ContextMessageRow {
    id: string;
    turnId: string;
    role: 'USER' | 'ASSISTANT';
    source: string;
    content: string;
    createdAt: Date;
    turn: {
        status: string;
        createdAt: Date;
    };
}
export interface ContextDraftRow {
    id: string;
    status: string;
    operation: string;
    transactionType: string;
    amount: {
        toString(): string;
    };
    transactionDate: Date;
    description: string | null;
    expiresAt: Date;
}
export interface ContextToolExecutionRow {
    id: string;
    toolId: string;
    status: string;
    startedAt: Date;
    outputSummary: unknown;
}
export interface AssistantContextAssemblyInput {
    readonly conversation: ContextConversationRow;
    readonly messages: readonly ContextMessageRow[];
    readonly pendingDraft: ContextDraftRow | null;
    readonly toolExecutions: readonly ContextToolExecutionRow[];
    readonly currentRequest: string;
}

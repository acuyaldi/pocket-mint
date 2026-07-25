export type AssistantProviderKind = 'gemini';
export interface AssistantProviderMessage {
    readonly role: 'user';
    readonly content: string;
}
export interface AssistantProviderUsage {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
    readonly cachedInputTokens?: number;
}
export interface AssistantModelRequest {
    readonly systemInstruction: string;
    readonly messages: readonly AssistantProviderMessage[];
    readonly responseSchema: Readonly<Record<string, unknown>>;
    readonly signal: AbortSignal;
}
export interface AssistantModelResponse {
    readonly output: unknown;
    readonly outputBytes: number;
    readonly finishClassification: 'STOP' | 'SAFETY' | 'OTHER' | 'UNKNOWN';
    readonly usage?: AssistantProviderUsage;
}
export interface AssistantModelProvider {
    readonly kind: AssistantProviderKind;
    readonly model: string;
    generateStructuredResponse(request: AssistantModelRequest): Promise<AssistantModelResponse>;
}
export type AssistantProviderErrorCode = 'ASSISTANT_PROVIDER_UNAVAILABLE' | 'ASSISTANT_PROVIDER_TIMEOUT' | 'ASSISTANT_PROVIDER_RATE_LIMITED' | 'ASSISTANT_PROVIDER_INVALID_RESPONSE' | 'ASSISTANT_PROVIDER_CONFIGURATION_ERROR' | 'ASSISTANT_PROVIDER_REFUSED';
export declare class AssistantProviderError extends Error {
    readonly code: AssistantProviderErrorCode;
    readonly statusCode: number;
    readonly isOperational = true;
    constructor(code: AssistantProviderErrorCode, message: string, statusCode: number);
    static invalidResponse(): AssistantProviderError;
    static timeout(): AssistantProviderError;
    static unavailable(): AssistantProviderError;
    static rateLimited(): AssistantProviderError;
    static configuration(): AssistantProviderError;
    static refused(): AssistantProviderError;
}
export interface ProviderCapability {
    readonly intent: string;
    readonly description: string;
    readonly category: string;
    readonly requiredArguments: readonly string[];
    readonly optionalArguments: readonly string[];
    readonly argumentContract: Readonly<Record<string, {
        readonly type: 'string';
        readonly description: string;
        readonly enum?: readonly string[];
        readonly format?: string;
    }>>;
    readonly confirmationMayBeRequired: boolean;
}
export type AssistantPlan = {
    readonly kind: 'intent';
    readonly intent: string;
    readonly arguments: unknown;
    readonly policy: {
        readonly action: 'EXECUTE_IMMEDIATELY' | 'DRAFT_AND_CONFIRM';
    };
} | {
    readonly kind: 'clarification';
    readonly question: string;
} | {
    readonly kind: 'unsupported';
    readonly message: string;
};
export declare const ASSISTANT_RESPONSE_JSON_SCHEMA: Readonly<Record<string, unknown>>;

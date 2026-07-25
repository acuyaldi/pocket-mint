export declare class AssistantError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly isOperational = true;
    private constructor();
    static toolNotFound(toolId: string): AssistantError;
    static toolDisabled(toolId: string): AssistantError;
    static invalidInput(toolId: string, detail: string): AssistantError;
    static invalidOutput(toolId: string, detail: string): AssistantError;
    static duplicateRegistration(toolId: string): AssistantError;
    static policyDenied(toolId: string, reason: string): AssistantError;
    static executionTimeout(toolId: string, timeoutMs: number): AssistantError;
    static invalidTimeout(toolId: string, timeoutMs: number): AssistantError;
    static policyMismatch(toolId: string, detail: string): AssistantError;
    static unsupportedIntent(intent: string): AssistantError;
    static invalidRequest(detail: string): AssistantError;
    static conversationNotFound(): AssistantError;
    static conversationNotContinuable(): AssistantError;
    static invalidContextConfiguration(): AssistantError;
    static contextTooLarge(): AssistantError;
    static unsupportedContextData(): AssistantError;
    static contextPreparationFailed(): AssistantError;
    static invalidIdempotencyKey(): AssistantError;
    static draftNotFound(): AssistantError;
    static draftConflict(status: string): AssistantError;
    static idempotencyConflict(): AssistantError;
}

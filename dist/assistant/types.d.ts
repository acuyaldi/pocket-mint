/** Stable namespaced tool identifier (e.g. "analytics.monthly-spending-summary"). */
export type ToolId = string;
/**
 * Domain capability exposed by a tool. Not an independent RBAC system —
 * it labels the contract so the policy evaluator and registry can reason
 * about which tools a conversation may invoke. Ownership enforcement
 * remains `req.auth.userId → domain service` as today.
 *
 * Examples: "analytics.read", "transaction.create", "budget.read".
 */
export type Capability = string;
/** Static risk tier assigned at tool-registration time (§12 of the ADR). */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
/** Minimum confirmation required before a tool can execute. */
export type ConfirmationPolicy = 'NONE' | 'EXPLICIT' | 'STEP_UP' | 'DISABLED';
/** Whether a tool requires or supports idempotency keys. */
export type IdempotencyPolicy = 'NOT_REQUIRED' | 'SUPPORTED' | 'REQUIRED';
/** Lifecycle states for a single tool execution. */
export type ToolExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
/**
 * Generic, provider-neutral tool definition. Provider-native tool schemas
 * are generated from this contract by the provider adapter; nothing
 * upstream of the adapter knows a provider-specific format.
 *
 * @template TInput  — validated input shape the tool receives at runtime.
 * @template TOutput — validated output shape the tool must produce.
 */
export interface ToolContract<TInput = unknown, TOutput = unknown> {
    readonly id: ToolId;
    /** Human- and provider-facing description of what the tool does. */
    readonly description: string;
    readonly capability: Capability;
    readonly riskLevel: RiskLevel;
    readonly confirmationPolicy: ConfirmationPolicy;
    readonly idempotencyPolicy: IdempotencyPolicy;
    /** Execution timeout in milliseconds. Must be positive. */
    readonly timeoutMs: number;
    /** Whether the tool is available. Disabled tools are excluded from discovery. */
    readonly enabled: boolean;
    /** Provider-safe argument metadata. It contains no handlers, policy internals, or owner fields. */
    readonly providerArguments: {
        readonly required: readonly string[];
        readonly optional: readonly string[];
        readonly properties: Readonly<Record<string, {
            readonly type: 'string';
            readonly description: string;
            readonly enum?: readonly string[];
            readonly format?: string;
        }>>;
    };
    /** Validate and transform untrusted input. Throws AssistantError on failure. */
    readonly validateInput: (input: unknown) => TInput;
    /** Validate structured output before it leaves Assistant Core. Throws AssistantError on failure. */
    readonly validateOutput: (output: unknown) => TOutput;
    /** Fields whose values should be redacted from audit logs (e.g. ["note"]). */
    readonly auditRedact?: readonly string[];
}
/**
 * Minimal tool execution context. Populated internally by the Execution
 * Engine — tool input must never contain or override the authenticated
 * user ID (§5 of the ADR).
 */
export interface ExecutionContext {
    readonly userId: string;
    readonly correlationId: string;
    readonly conversationId?: string;
    readonly turnId?: string;
    readonly timestamp: Date;
}
/** Outcome of policy evaluation for a tool. */
export type PolicyResult = {
    readonly action: 'EXECUTE_IMMEDIATELY';
} | {
    readonly action: 'DRAFT_AND_CONFIRM';
} | {
    readonly action: 'STEP_UP_REQUIRED';
} | {
    readonly action: 'UNAVAILABLE';
    readonly reason: string;
};
/** Provider-neutral canonical request entering Assistant Core. */
export interface AssistantCanonicalRequest {
    /** Optional user-visible content. Whitespace-only content is treated as absent. */
    readonly message?: string;
    /** Stable intent identifier (e.g. "analytics.monthly-spending-summary"). */
    readonly intent: string;
    /** Tool arguments validated by the registered contract. */
    readonly arguments: unknown;
    /** Optional client-supplied conversation reference. */
    readonly conversationId?: string;
    /** Optional locale hint (e.g. "id-ID"). */
    readonly locale?: string;
}
/** Successful execution — rendered answer ready for the client. */
export interface AssistantSuccessResponse {
    readonly status: 'success';
    readonly renderedText: string;
    /** Safe structured data the client may render independently. */
    readonly data: unknown;
    readonly correlationId: string;
    readonly conversationId: string;
    readonly turnId: string;
}
/** The intent was understood but requires clarification before execution. */
export interface AssistantClarificationResponse {
    readonly status: 'clarification_required';
    readonly message: string;
    readonly data?: unknown;
    readonly correlationId: string;
    readonly conversationId: string;
    readonly turnId: string;
}
/** The request was rejected by policy or validation. */
export interface AssistantRejectedResponse {
    readonly status: 'rejected';
    readonly code: string;
    readonly message: string;
    readonly correlationId: string;
    readonly conversationId: string;
    readonly turnId: string;
}
/** An unexpected failure occurred during processing. */
export interface AssistantErrorResponse {
    readonly status: 'error';
    readonly code: string;
    readonly message: string;
    readonly correlationId: string;
    readonly conversationId: string;
    readonly turnId: string;
}
export type AssistantCanonicalResponse = AssistantSuccessResponse | AssistantClarificationResponse | AssistantRejectedResponse | AssistantErrorResponse;
/** Structured outcome from a single tool execution. */
export interface ToolExecutionResult {
    readonly toolId: string;
    readonly status: 'SUCCEEDED' | 'FAILED';
    readonly output?: unknown;
    readonly error?: string;
    readonly durationMs: number;
}

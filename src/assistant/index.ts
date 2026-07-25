// ============================================================
// Assistant Core — public API surface
// ------------------------------------------------------------
// Everything downstream of the provider adapter imports from here.
// All types are provider-neutral; no LLM SDK, Prisma, or Express
// types leak through this barrel.
// ============================================================

export { AssistantError } from './errors';
export { evaluatePolicy } from './policy';
export { ToolRegistry } from './registry';
export { monthlySpendingSummary, transactionCreate } from './tools';
export type { TransactionCreateInput } from './tools';
export { executeTool } from './executor';
export { resolveIntent } from './intent';
export { renderMonthlySpendingSummary } from './renderer';
export { toolRegistry, handlerRegistry } from './bootstrap';
export { createAssistantConversationService } from './conversation.service';
export { createAssistantApplicationService } from './application.service';
export { createAssistantProviderRuntime } from './provider-runtime';
export { createAssistantProviderAuditService } from './provider-audit.service';
export { createGeminiAssistantProvider } from './providers/gemini.provider';
export { buildProviderCapabilityCatalog } from './provider-capability';
export { buildAssistantSystemInstruction } from './provider-instruction';
export { assembleAssistantModelRequest } from './provider-prompt';
export { validateAssistantPlan } from './provider-plan';
export { AssistantProviderError } from './provider-types';
export * from './entity-resolution';
export * from './persistence';
export { createClarificationService } from './clarification.service';
export type { ClarificationService } from './clarification.service';
export type {
  CanonicalContext,
  ClarificationOptionToken,
  ClarificationProjection,
  TerminalClarification,
  SafeDraftMetadata,
  AssistantStateProjection,
  CreateClarificationInput,
  SelectClarificationInput,
  SelectClarificationResult,
  CancelClarificationInput,
  ClarificationAdvanceResult,
} from './clarification.types';

export type {
  ToolId,
  Capability,
  RiskLevel,
  ConfirmationPolicy,
  IdempotencyPolicy,
  ToolExecutionStatus,
  ToolContract,
  ExecutionContext,
  PolicyResult,
  AssistantCanonicalRequest,
  AssistantCanonicalResponse,
  AssistantSuccessResponse,
  AssistantClarificationResponse,
  AssistantRejectedResponse,
  AssistantErrorResponse,
  ToolExecutionResult,
} from './types';

export type { ToolHandler, HandlerRegistry } from './executor';
export type { AssistantConversationService } from './conversation.service';
export type {
  AssistantContext,
  AssistantContextLimits,
  ConversationContext,
  DraftContext,
  MessageContext,
  ToolExecutionContext,
  TurnContext,
} from './context.types';
export type * from './conversation.types';
export type * from './provider-types';
export type { AssistantProviderRuntime, AssistantProviderMessageInput, AssistantProviderRuntimeResult } from './provider-runtime';

// ============================================================
// Assistant Core — domain errors
// ------------------------------------------------------------
// Follows the existing structural convention expected by
// forwardError.ts / error.middleware.ts: isOperational, statusCode,
// code. Compatible with the central error handler without importing
// Express types or HTTP helpers.
//
// All Assistant errors use the 4xx range so the central handler
// treats them as operational (safe message shown to client).
// ============================================================

export class AssistantError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly isOperational = true;
  /** Optional bounded, non-sensitive detail (e.g. a draft status) for observability categorization — never user content. */
  readonly detail?: string;

  private constructor(message: string, statusCode: number, code: string, detail?: string) {
    super(message);
    this.name = 'AssistantError';
    this.statusCode = statusCode;
    this.code = code;
    this.detail = detail;
    Object.setPrototypeOf(this, AssistantError.prototype);
  }

  // -- Factory methods -------------------------------------------------------

  static toolNotFound(toolId: string): AssistantError {
    return new AssistantError(
      `Tool not found: ${toolId}`,
      404,
      'ASSISTANT_TOOL_NOT_FOUND',
    );
  }

  static toolDisabled(toolId: string): AssistantError {
    return new AssistantError(
      `Tool is disabled: ${toolId}`,
      403,
      'ASSISTANT_TOOL_DISABLED',
    );
  }

  static invalidInput(toolId: string, detail: string): AssistantError {
    return new AssistantError(
      `Invalid input for tool "${toolId}": ${detail}`,
      400,
      'ASSISTANT_INVALID_INPUT',
    );
  }

  static invalidOutput(toolId: string, detail: string): AssistantError {
    return new AssistantError(
      `Invalid output from tool "${toolId}": ${detail}`,
      500,
      'ASSISTANT_INVALID_OUTPUT',
    );
  }

  static duplicateRegistration(toolId: string): AssistantError {
    return new AssistantError(
      `Duplicate tool registration: "${toolId}" is already registered`,
      409,
      'ASSISTANT_DUPLICATE_TOOL',
    );
  }

  static policyDenied(toolId: string, reason: string): AssistantError {
    return new AssistantError(
      `Policy denied tool "${toolId}": ${reason}`,
      403,
      'ASSISTANT_POLICY_DENIED',
    );
  }

  static executionTimeout(toolId: string, timeoutMs: number): AssistantError {
    return new AssistantError(
      `The Assistant stopped waiting for the tool result (${toolId}) after ${timeoutMs}ms. The underlying operation may still complete.`,
      504,
      'ASSISTANT_EXECUTION_TIMEOUT',
    );
  }

  static invalidTimeout(toolId: string, timeoutMs: number): AssistantError {
    return new AssistantError(
      `Tool "${toolId}" has invalid timeout: ${timeoutMs}ms (must be > 0)`,
      500,
      'ASSISTANT_INVALID_TIMEOUT',
    );
  }

  static policyMismatch(toolId: string, detail: string): AssistantError {
    return new AssistantError(
      `Policy inconsistency in tool "${toolId}": ${detail}`,
      500,
      'ASSISTANT_POLICY_MISMATCH',
    );
  }

  static unsupportedIntent(intent: string): AssistantError {
    return new AssistantError(
      `Unsupported intent: "${intent}"`,
      400,
      'ASSISTANT_UNSUPPORTED_INTENT',
    );
  }

  static invalidRequest(detail: string): AssistantError {
    return new AssistantError(`Invalid Assistant request: ${detail}`, 400, 'ASSISTANT_INVALID_REQUEST');
  }

  static conversationNotFound(): AssistantError {
    return new AssistantError('Conversation not found', 404, 'ASSISTANT_CONVERSATION_NOT_FOUND');
  }

  static conversationNotContinuable(): AssistantError {
    return new AssistantError('Conversation cannot be continued', 409, 'ASSISTANT_CONVERSATION_NOT_CONTINUABLE');
  }

  static invalidContextConfiguration(): AssistantError {
    return new AssistantError('Assistant context configuration is invalid', 500, 'ASSISTANT_CONTEXT_INVALID_CONFIGURATION');
  }

  static contextTooLarge(): AssistantError {
    return new AssistantError('Assistant context required content exceeds the size limit', 413, 'ASSISTANT_CONTEXT_TOO_LARGE');
  }

  static unsupportedContextData(): AssistantError {
    return new AssistantError('Assistant context contains unsupported data', 500, 'ASSISTANT_CONTEXT_UNSUPPORTED_DATA');
  }

  static contextPreparationFailed(): AssistantError {
    return new AssistantError('Assistant context could not be prepared', 500, 'ASSISTANT_CONTEXT_PREPARATION_FAILED');
  }

  static invalidIdempotencyKey(): AssistantError {
    return new AssistantError('Idempotency-Key must use 1-128 safe characters', 400, 'ASSISTANT_INVALID_IDEMPOTENCY_KEY');
  }

  static draftNotFound(): AssistantError {
    return new AssistantError('Financial draft not found', 404, 'ASSISTANT_DRAFT_NOT_FOUND');
  }

  static draftConflict(status: string): AssistantError {
    return new AssistantError(`Financial draft cannot perform this operation from ${status}`, 409, 'ASSISTANT_DRAFT_CONFLICT', status);
  }

  static idempotencyConflict(): AssistantError {
    return new AssistantError('Idempotency key is already bound to another operation', 409, 'ASSISTANT_IDEMPOTENCY_CONFLICT');
  }

  static clarificationNotFound(): AssistantError {
    return new AssistantError('Clarification not found', 404, 'ASSISTANT_CLARIFICATION_NOT_FOUND');
  }

  static clarificationInvalidOption(): AssistantError {
    return new AssistantError('Clarification option is invalid', 400, 'ASSISTANT_CLARIFICATION_INVALID_OPTION');
  }

  static clarificationAlreadyConsumed(): AssistantError {
    return new AssistantError('Clarification was already consumed', 409, 'ASSISTANT_CLARIFICATION_ALREADY_CONSUMED');
  }

  static clarificationCancelled(): AssistantError {
    return new AssistantError('Clarification was already cancelled', 409, 'ASSISTANT_CLARIFICATION_CANCELLED');
  }

  static clarificationStale(): AssistantError {
    return new AssistantError('Clarification is stale and requires restart', 409, 'ASSISTANT_CLARIFICATION_STALE');
  }

  static clarificationExpired(): AssistantError {
    return new AssistantError('Clarification has expired and requires restart', 409, 'ASSISTANT_CLARIFICATION_EXPIRED');
  }

  static clarificationContinuationInvalid(): AssistantError {
    return new AssistantError('Clarification cannot be continued', 409, 'ASSISTANT_CLARIFICATION_CONTINUATION_INVALID');
  }

  static clarificationContextInvalid(): AssistantError {
    return new AssistantError('Clarification context is invalid', 409, 'ASSISTANT_CLARIFICATION_CONTEXT_INVALID');
  }
}

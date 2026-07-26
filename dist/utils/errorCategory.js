"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categorizeError = categorizeError;
const errors_1 = require("../assistant/errors");
const provider_types_1 = require("../assistant/provider-types");
/** AssistantError.code → bounded category, for the codes that don't need extra detail. */
const ASSISTANT_CODE_CATEGORY = {
    ASSISTANT_INVALID_INPUT: 'validation',
    ASSISTANT_INVALID_REQUEST: 'validation',
    ASSISTANT_UNSUPPORTED_INTENT: 'validation',
    ASSISTANT_INVALID_IDEMPOTENCY_KEY: 'validation',
    ASSISTANT_CONTEXT_TOO_LARGE: 'validation',
    ASSISTANT_CONTEXT_UNSUPPORTED_DATA: 'validation',
    ASSISTANT_CLARIFICATION_INVALID_OPTION: 'validation',
    ASSISTANT_CLARIFICATION_CONTEXT_INVALID: 'validation',
    ASSISTANT_TOOL_NOT_FOUND: 'not_found',
    ASSISTANT_CONVERSATION_NOT_FOUND: 'not_found',
    ASSISTANT_DRAFT_NOT_FOUND: 'not_found',
    ASSISTANT_CLARIFICATION_NOT_FOUND: 'not_found',
    ASSISTANT_TOOL_DISABLED: 'policy_rejected',
    ASSISTANT_POLICY_DENIED: 'policy_rejected',
    ASSISTANT_EXECUTION_TIMEOUT: 'tool_failure',
    ASSISTANT_CONVERSATION_NOT_CONTINUABLE: 'conflict',
    ASSISTANT_CLARIFICATION_CANCELLED: 'conflict',
    ASSISTANT_CLARIFICATION_CONTINUATION_INVALID: 'conflict',
    ASSISTANT_CLARIFICATION_STALE: 'expired',
    ASSISTANT_CLARIFICATION_EXPIRED: 'expired',
    ASSISTANT_CLARIFICATION_ALREADY_CONSUMED: 'already_consumed',
    ASSISTANT_IDEMPOTENCY_CONFLICT: 'idempotency',
    ASSISTANT_DUPLICATE_TOOL: 'internal',
    ASSISTANT_INVALID_OUTPUT: 'internal',
    ASSISTANT_INVALID_TIMEOUT: 'internal',
    ASSISTANT_POLICY_MISMATCH: 'internal',
    ASSISTANT_CONTEXT_INVALID_CONFIGURATION: 'internal',
    ASSISTANT_CONTEXT_PREPARATION_FAILED: 'internal',
};
const PROVIDER_CODE_CATEGORY = {
    ASSISTANT_PROVIDER_TIMEOUT: 'provider_timeout',
    ASSISTANT_PROVIDER_RATE_LIMITED: 'provider_rate_limit',
    ASSISTANT_PROVIDER_INVALID_RESPONSE: 'provider_invalid_response',
    ASSISTANT_PROVIDER_CONFIGURATION_ERROR: 'provider_unavailable',
    ASSISTANT_PROVIDER_UNAVAILABLE: 'provider_unavailable',
    ASSISTANT_PROVIDER_REFUSED: 'provider_invalid_response',
};
/**
 * Map a real application error to a bounded, low-cardinality category for
 * logging. Never derived from the raw exception message — only from the
 * error's own type/code (or, for `ASSISTANT_DRAFT_CONFLICT`, its structured
 * `detail`, which is a draft status enum value, not user content).
 */
function categorizeError(err) {
    if (err instanceof provider_types_1.AssistantProviderError) {
        return PROVIDER_CODE_CATEGORY[err.code] ?? 'provider_unavailable';
    }
    if (err instanceof errors_1.AssistantError) {
        if (err.code === 'ASSISTANT_DRAFT_CONFLICT') {
            return err.detail === 'EXPIRED' ? 'expired' : 'conflict';
        }
        return ASSISTANT_CODE_CATEGORY[err.code] ?? 'internal';
    }
    const statusCode = err?.statusCode;
    if (statusCode === 401)
        return 'authentication';
    if (statusCode === 403)
        return 'authorization';
    if (statusCode === 400 || statusCode === 422)
        return 'validation';
    if (statusCode === 404)
        return 'not_found';
    if (statusCode === 409)
        return 'conflict';
    if (statusCode === 429)
        return 'provider_rate_limit';
    const code = err?.code;
    if (typeof code === 'string' && /^P\d{4}$/.test(code))
        return 'database';
    if (err instanceof Error && /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET/.test(err.message))
        return 'network';
    return 'internal';
}
//# sourceMappingURL=errorCategory.js.map
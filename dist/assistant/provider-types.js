"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantProviderError = void 0;
exports.buildAssistantResponseJsonSchema = buildAssistantResponseJsonSchema;
class AssistantProviderError extends Error {
    constructor(code, message, statusCode) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = true;
        this.name = 'AssistantProviderError';
    }
    static invalidResponse() {
        return new AssistantProviderError('ASSISTANT_PROVIDER_INVALID_RESPONSE', 'Assistant provider returned an invalid response.', 502);
    }
    static timeout() {
        return new AssistantProviderError('ASSISTANT_PROVIDER_TIMEOUT', 'Assistant provider request timed out.', 504);
    }
    static unavailable() {
        return new AssistantProviderError('ASSISTANT_PROVIDER_UNAVAILABLE', 'Assistant provider is temporarily unavailable.', 503);
    }
    static rateLimited() {
        return new AssistantProviderError('ASSISTANT_PROVIDER_RATE_LIMITED', 'Assistant provider is temporarily rate limited.', 429);
    }
    static configuration() {
        return new AssistantProviderError('ASSISTANT_PROVIDER_CONFIGURATION_ERROR', 'Assistant provider configuration is invalid.', 503);
    }
    static refused() {
        return new AssistantProviderError('ASSISTANT_PROVIDER_REFUSED', 'Assistant provider could not process the request safely.', 422);
    }
}
exports.AssistantProviderError = AssistantProviderError;
/**
 * Builds the structured-output schema sent to the provider.
 *
 * `arguments` must enumerate the capability argument keys explicitly. Gemini
 * constrains decoding to the supplied schema, and it reads a bare
 * `{ type: 'object' }` as an object with no permitted keys — it then always
 * emits `arguments: {}` and silently drops every argument it inferred. The
 * key list is derived from the tool registry catalog so the schema and the
 * catalog in the system instruction cannot drift apart.
 *
 * This is a decoding constraint, not the trust boundary: `validateAssistantPlan`
 * still allow-lists arguments per intent and revalidates them against the
 * tool contract.
 */
function buildAssistantResponseJsonSchema(catalog) {
    const argumentProperties = {};
    for (const capability of catalog) {
        for (const [name, spec] of Object.entries(capability.argumentContract)) {
            argumentProperties[name] = {
                type: spec.type,
                description: spec.description,
                ...(spec.enum ? { enum: [...spec.enum] } : {}),
            };
        }
    }
    return Object.freeze({
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'intent', 'arguments', 'clarification', 'userMessage'],
        properties: {
            kind: { type: 'string', enum: ['intent', 'clarification', 'unsupported'] },
            intent: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            arguments: {
                type: 'object',
                additionalProperties: false,
                properties: argumentProperties,
            },
            clarification: {
                anyOf: [
                    { type: 'null' },
                    {
                        type: 'object',
                        additionalProperties: false,
                        required: ['question'],
                        properties: { question: { type: 'string', maxLength: 500 } },
                    },
                ],
            },
            userMessage: { type: 'string', maxLength: 2000 },
        },
    });
}
//# sourceMappingURL=provider-types.js.map
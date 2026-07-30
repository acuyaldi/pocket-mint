"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAssistantProviderRuntime = createAssistantProviderRuntime;
const provider_capability_1 = require("./provider-capability");
const provider_prompt_1 = require("./provider-prompt");
const provider_plan_1 = require("./provider-plan");
const provider_types_1 = require("./provider-types");
const persistence_1 = require("./persistence");
const errors_1 = require("./errors");
const logger_1 = require("../utils/logger");
const errorCategory_1 = require("../utils/errorCategory");
const rupiah_amount_recovery_1 = require("./rupiah-amount-recovery");
const transaction_type_recovery_1 = require("./transaction-type-recovery");
function modelInputBytes(request) {
    return Buffer.byteLength(JSON.stringify({
        systemInstruction: request.systemInstruction,
        messages: request.messages.map((message) => message.content),
    }), 'utf8');
}
function normalizeProviderError(error) {
    return error instanceof provider_types_1.AssistantProviderError ? error : provider_types_1.AssistantProviderError.unavailable();
}
function recoverMissingTransactionFields(output, message) {
    if (typeof output !== 'object' || output === null || Array.isArray(output))
        return output;
    const plan = output;
    if (plan.kind !== 'intent' || plan.intent !== 'transaction.create')
        return output;
    const args = plan.arguments;
    if (typeof args !== 'object' || args === null || Array.isArray(args))
        return output;
    const argumentsValue = args;
    let recovered = false;
    const recoveredArguments = { ...argumentsValue };
    const recoveredAmount = (0, rupiah_amount_recovery_1.recoverSingleExplicitIndonesianAmount)(message);
    if ((argumentsValue.amount === null || argumentsValue.amount === undefined) && recoveredAmount) {
        recoveredArguments.amount = recoveredAmount;
        recovered = true;
    }
    const recoveredType = (0, transaction_type_recovery_1.recoverExplicitTransactionType)(message);
    if ((argumentsValue.type === null || argumentsValue.type === undefined) && recoveredType) {
        recoveredArguments.type = recoveredType;
        recovered = true;
    }
    if (!recovered)
        return output;
    return {
        ...plan,
        arguments: recoveredArguments,
    };
}
function createAssistantProviderRuntime(deps) {
    async function finalizeAuditSafely(id, input, metadata) {
        try {
            await deps.audit.finalize(id, input);
        }
        catch {
            logger_1.logger.warn('assistant_provider_audit_finalize_failed', {
                ...metadata,
                provider: deps.provider.kind,
                model: deps.provider.model,
                status: input.status,
            });
        }
    }
    async function persistNonToolResult(userId, correlationId, conversationId, locale, message, input) {
        const turn = await deps.conversations.beginTurn({
            userId,
            conversationId,
            correlationId,
            intent: input.intent,
            locale,
            content: message,
            source: 'USER_PROVIDED',
        });
        await deps.conversations.finalizeWithoutTool({ ...turn, ...input });
        return turn;
    }
    async function invokeProvider(request, controller) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                controller.abort();
                reject(provider_types_1.AssistantProviderError.timeout());
            }, deps.timeoutMs);
        });
        try {
            return await Promise.race([deps.provider.generateStructuredResponse(request), timeout]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
    async function sendMessage(userId, correlationId, input) {
        const message = (0, persistence_1.normalizeProvidedMessage)(input.message);
        if (!message)
            throw errors_1.AssistantError.invalidRequest('message is required');
        (0, persistence_1.assertAssistantMessageLength)(message);
        const locale = input.locale?.trim() || 'id-ID';
        const conversationId = await deps.conversations.establishConversation(userId, input.conversationId, locale);
        const context = await deps.application.prepareProviderExecution({ userId, conversationId, currentRequest: message });
        const abortController = new AbortController();
        const request = (0, provider_prompt_1.assembleAssistantModelRequest)(context, (0, provider_capability_1.buildProviderCapabilityCatalog)(deps.toolRegistry), abortController.signal);
        const inputBytes = modelInputBytes(request);
        const providerExecutionId = await deps.audit.begin({
            userId,
            conversationId,
            correlationId,
            provider: deps.provider.kind,
            model: deps.provider.model,
            inputBytes,
        });
        const startedAt = Date.now();
        let providerStageComplete = false;
        (0, logger_1.logEvent)('info', {
            event: 'assistant.provider.started',
            requestId: correlationId,
            provider: deps.provider.kind,
            model: deps.provider.model,
        });
        try {
            const providerResponse = await invokeProvider(request, abortController);
            if (providerResponse.finishClassification === 'SAFETY')
                throw provider_types_1.AssistantProviderError.refused();
            if (providerResponse.finishClassification !== 'STOP')
                throw provider_types_1.AssistantProviderError.invalidResponse();
            const normalizedOutput = recoverMissingTransactionFields(providerResponse.output, message);
            const plan = (0, provider_plan_1.validateAssistantPlan)(normalizedOutput, deps.toolRegistry);
            providerStageComplete = true;
            const durationMs = Date.now() - startedAt;
            (0, logger_1.logEvent)('info', {
                event: 'assistant.provider.completed',
                requestId: correlationId,
                provider: deps.provider.kind,
                model: deps.provider.model,
                durationMs,
                outcome: plan.kind,
            });
            if (plan.kind === 'intent') {
                const result = await deps.application.execute(userId, correlationId, {
                    conversationId,
                    message,
                    intent: plan.intent,
                    arguments: plan.arguments,
                    locale,
                });
                await finalizeAuditSafely(providerExecutionId, {
                    status: 'PLAN_ACCEPTED',
                    turnId: result.response.turnId,
                    durationMs,
                    outputBytes: providerResponse.outputBytes,
                    finishClassification: providerResponse.finishClassification,
                    usage: providerResponse.usage,
                }, { correlationId, conversationId });
                return result;
            }
            if (plan.kind === 'clarification') {
                const turn = await persistNonToolResult(userId, correlationId, conversationId, locale, message, {
                    intent: 'provider.clarification',
                    turnStatus: 'CLARIFICATION_REQUIRED',
                    assistantContent: plan.question,
                    assistantSource: 'PROVIDER_CLARIFICATION',
                });
                await finalizeAuditSafely(providerExecutionId, {
                    status: 'CLARIFICATION',
                    turnId: turn.turnId,
                    durationMs,
                    outputBytes: providerResponse.outputBytes,
                    finishClassification: providerResponse.finishClassification,
                    usage: providerResponse.usage,
                }, { correlationId, conversationId });
                return {
                    httpStatus: 200,
                    response: { status: 'clarification_required', message: plan.question, data: { kind: 'provider_text' }, correlationId, ...turn },
                };
            }
            const turn = await persistNonToolResult(userId, correlationId, conversationId, locale, message, {
                intent: 'provider.unsupported',
                turnStatus: 'SUCCEEDED',
                assistantContent: plan.message,
                assistantSource: 'DETERMINISTIC_RENDERER',
            });
            await finalizeAuditSafely(providerExecutionId, {
                status: 'UNSUPPORTED',
                turnId: turn.turnId,
                durationMs,
                outputBytes: providerResponse.outputBytes,
                finishClassification: providerResponse.finishClassification,
                usage: providerResponse.usage,
            }, { correlationId, conversationId });
            return {
                httpStatus: 200,
                response: { status: 'unsupported', message: plan.message, correlationId, ...turn },
            };
        }
        catch (error) {
            if (providerStageComplete)
                throw error;
            abortController.abort();
            const operational = normalizeProviderError(error);
            const turn = await persistNonToolResult(userId, correlationId, conversationId, locale, message, {
                intent: 'provider.failure',
                turnStatus: 'FAILED',
                assistantContent: operational.message,
                assistantSource: 'SAFE_ERROR',
                safeErrorCode: operational.code,
            });
            const durationMs = Date.now() - startedAt;
            await finalizeAuditSafely(providerExecutionId, {
                status: 'FAILED',
                turnId: turn.turnId,
                durationMs,
                safeErrorCode: operational.code,
            }, { correlationId, conversationId });
            (0, logger_1.logEvent)('warn', {
                event: 'assistant.provider.failed',
                requestId: correlationId,
                provider: deps.provider.kind,
                model: deps.provider.model,
                durationMs,
                errorCategory: (0, errorCategory_1.categorizeError)(operational),
            });
            return {
                httpStatus: operational.statusCode,
                response: { status: 'error', code: operational.code, message: operational.message, correlationId, ...turn },
            };
        }
    }
    // ---- Channel callback passthroughs -----------------------------------
    // Thin forwards to the same authoritative services the HTTP path calls
    // (assistant.controller.ts) — no parallel clarification/draft logic here.
    // These exist so a Telegram callback handler can reuse them without
    // importing application.service.ts / financial-draft.service.ts directly
    // (see test/channels/telegramAdapterBoundary.test.ts).
    function selectClarification(userId, correlationId, token, conversationId, clarificationId) {
        return deps.application.selectClarification(userId, correlationId, token, conversationId, clarificationId);
    }
    function cancelClarification(userId, correlationId, clarificationId, conversationId) {
        return deps.application.cancelClarification(userId, correlationId, clarificationId, conversationId);
    }
    function confirmDraft(userId, draftId, idempotencyKey, correlationId) {
        return deps.financialDrafts.confirm(userId, draftId, idempotencyKey, correlationId);
    }
    function cancelDraft(userId, draftId, correlationId) {
        return deps.financialDrafts.cancel(userId, draftId, correlationId);
    }
    function getAssistantState(userId, conversationId) {
        return deps.application.getAssistantState(userId, conversationId);
    }
    return { sendMessage, selectClarification, cancelClarification, confirmDraft, cancelDraft, getAssistantState };
}
//# sourceMappingURL=provider-runtime.js.map
import type { AssistantApplicationService, AssistantApplicationResult } from './application.service';
import type { AssistantConversationService } from './conversation.service';
import { buildProviderCapabilityCatalog } from './provider-capability';
import { assembleAssistantModelRequest } from './provider-prompt';
import { validateAssistantPlan } from './provider-plan';
import { AssistantProviderError, type AssistantModelProvider, type AssistantProviderUsage } from './provider-types';
import type { ToolRegistry } from './registry';
import { assertAssistantMessageLength, normalizeProvidedMessage } from './persistence';
import { AssistantError } from './errors';
import { logger, logEvent } from '../utils/logger';
import { categorizeError } from '../utils/errorCategory';

export interface AssistantProviderAudit {
  begin(input: {
    userId: string;
    conversationId: string;
    correlationId: string;
    provider: string;
    model: string;
    inputBytes: number;
  }): Promise<string>;
  finalize(id: string, input: {
    status: 'PLAN_ACCEPTED' | 'CLARIFICATION' | 'UNSUPPORTED' | 'FAILED';
    turnId?: string;
    durationMs: number;
    outputBytes?: number;
    finishClassification?: string;
    safeErrorCode?: string;
    usage?: AssistantProviderUsage;
  }): Promise<void>;
}

export interface AssistantProviderMessageInput {
  readonly conversationId?: string;
  readonly message: string;
  readonly locale?: string;
}

export interface AssistantProviderRuntimeResult {
  readonly httpStatus: number;
  readonly response:
    | AssistantApplicationResult['response']
    | {
      readonly status: 'unsupported';
      readonly message: string;
      readonly correlationId: string;
      readonly conversationId: string;
      readonly turnId: string;
    };
}

interface RuntimeDependencies {
  application: AssistantApplicationService;
  conversations: AssistantConversationService;
  provider: AssistantModelProvider;
  audit: AssistantProviderAudit;
  toolRegistry: ToolRegistry;
  timeoutMs: number;
}

function modelInputBytes(request: { systemInstruction: string; messages: readonly { content: string }[] }): number {
  return Buffer.byteLength(JSON.stringify({
    systemInstruction: request.systemInstruction,
    messages: request.messages.map((message) => message.content),
  }), 'utf8');
}

function normalizeProviderError(error: unknown): AssistantProviderError {
  return error instanceof AssistantProviderError ? error : AssistantProviderError.unavailable();
}

export function createAssistantProviderRuntime(deps: RuntimeDependencies) {
  async function finalizeAuditSafely(
    id: string,
    input: Parameters<AssistantProviderAudit['finalize']>[1],
    metadata: { correlationId: string; conversationId: string },
  ): Promise<void> {
    try {
      await deps.audit.finalize(id, input);
    } catch {
      logger.warn('assistant_provider_audit_finalize_failed', {
        ...metadata,
        provider: deps.provider.kind,
        model: deps.provider.model,
        status: input.status,
      });
    }
  }

  async function persistNonToolResult(
    userId: string,
    correlationId: string,
    conversationId: string,
    locale: string,
    message: string,
    input: {
      intent: string;
      turnStatus: 'SUCCEEDED' | 'FAILED' | 'CLARIFICATION_REQUIRED';
      assistantContent: string;
      assistantSource: 'DETERMINISTIC_RENDERER' | 'PROVIDER_CLARIFICATION' | 'SAFE_ERROR';
      safeErrorCode?: string;
    },
  ) {
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

  async function invokeProvider(
    request: Parameters<AssistantModelProvider['generateStructuredResponse']>[0],
    controller: AbortController,
  ) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(AssistantProviderError.timeout());
      }, deps.timeoutMs);
    });
    try {
      return await Promise.race([deps.provider.generateStructuredResponse(request), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function sendMessage(
    userId: string,
    correlationId: string,
    input: AssistantProviderMessageInput,
  ): Promise<AssistantProviderRuntimeResult> {
    const message = normalizeProvidedMessage(input.message);
    if (!message) throw AssistantError.invalidRequest('message is required');
    assertAssistantMessageLength(message);
    const locale = input.locale?.trim() || 'id-ID';
    const conversationId = await deps.conversations.establishConversation(userId, input.conversationId, locale);
    const context = await deps.application.prepareProviderExecution({ userId, conversationId, currentRequest: message });
    const abortController = new AbortController();
    const request = assembleAssistantModelRequest(context, buildProviderCapabilityCatalog(deps.toolRegistry), abortController.signal);
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
    logEvent('info', {
      event: 'assistant.provider.started',
      requestId: correlationId,
      provider: deps.provider.kind,
      model: deps.provider.model,
    });

    try {
      const providerResponse = await invokeProvider(request, abortController);
      if (providerResponse.finishClassification === 'SAFETY') throw AssistantProviderError.refused();
      if (providerResponse.finishClassification !== 'STOP') throw AssistantProviderError.invalidResponse();
      const plan = validateAssistantPlan(providerResponse.output, deps.toolRegistry);
      providerStageComplete = true;
      const durationMs = Date.now() - startedAt;
      logEvent('info', {
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
          response: { status: 'clarification_required', message: plan.question, correlationId, ...turn },
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
    } catch (error) {
      if (providerStageComplete) throw error;
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
      logEvent('warn', {
        event: 'assistant.provider.failed',
        requestId: correlationId,
        provider: deps.provider.kind,
        model: deps.provider.model,
        durationMs,
        errorCategory: categorizeError(operational),
      });
      return {
        httpStatus: operational.statusCode,
        response: { status: 'error', code: operational.code, message: operational.message, correlationId, ...turn },
      };
    }
  }

  return { sendMessage };
}

export type AssistantProviderRuntime = ReturnType<typeof createAssistantProviderRuntime>;

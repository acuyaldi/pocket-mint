import type { AssistantContext } from './context.types';
import { buildAssistantSystemInstruction } from './provider-instruction';
import { buildAssistantResponseJsonSchema, type AssistantModelRequest, type ProviderCapability } from './provider-types';

export function assembleAssistantModelRequest(
  context: AssistantContext,
  catalog: readonly ProviderCapability[],
  signal: AbortSignal = new AbortController().signal,
): AssistantModelRequest {
  const untrustedContent = {
    historicalConversation: context.turns,
    priorToolSummaries: context.toolExecutions,
    ...(context.pendingDraft ? { pendingDraftContext: context.pendingDraft } : {}),
    currentRequest: context.currentRequest,
  };
  return {
    // The conversation's locale drives the reply language directive so the
    // model answers in the user's language instead of defaulting to English.
    systemInstruction: buildAssistantSystemInstruction(catalog, context.system.locale),
    messages: [{ role: 'user', content: JSON.stringify(untrustedContent) }],
    responseSchema: buildAssistantResponseJsonSchema(catalog),
    signal,
  };
}

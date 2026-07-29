"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assembleAssistantModelRequest = assembleAssistantModelRequest;
const provider_instruction_1 = require("./provider-instruction");
const provider_types_1 = require("./provider-types");
function assembleAssistantModelRequest(context, catalog, signal = new AbortController().signal) {
    const untrustedContent = {
        historicalConversation: context.turns,
        priorToolSummaries: context.toolExecutions,
        ...(context.pendingDraft ? { pendingDraftContext: context.pendingDraft } : {}),
        currentRequest: context.currentRequest,
    };
    return {
        // The conversation's locale drives the reply language directive so the
        // model answers in the user's language instead of defaulting to English.
        systemInstruction: (0, provider_instruction_1.buildAssistantSystemInstruction)(catalog, context.system.locale),
        messages: [{ role: 'user', content: JSON.stringify(untrustedContent) }],
        responseSchema: provider_types_1.ASSISTANT_RESPONSE_JSON_SCHEMA,
        signal,
    };
}
//# sourceMappingURL=provider-prompt.js.map
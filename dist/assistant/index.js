"use strict";
// ============================================================
// Assistant Core — public API surface
// ------------------------------------------------------------
// Everything downstream of the provider adapter imports from here.
// All types are provider-neutral; no LLM SDK, Prisma, or Express
// types leak through this barrel.
// ============================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClarificationService = exports.AssistantProviderError = exports.validateAssistantPlan = exports.assembleAssistantModelRequest = exports.buildAssistantSystemInstruction = exports.buildProviderCapabilityCatalog = exports.createGeminiAssistantProvider = exports.createAssistantProviderAuditService = exports.createAssistantProviderRuntime = exports.createAssistantApplicationService = exports.createAssistantConversationService = exports.handlerRegistry = exports.toolRegistry = exports.renderMonthlySpendingSummary = exports.resolveIntent = exports.executeTool = exports.transactionCreate = exports.monthlySpendingSummary = exports.ToolRegistry = exports.evaluatePolicy = exports.AssistantError = void 0;
var errors_1 = require("./errors");
Object.defineProperty(exports, "AssistantError", { enumerable: true, get: function () { return errors_1.AssistantError; } });
var policy_1 = require("./policy");
Object.defineProperty(exports, "evaluatePolicy", { enumerable: true, get: function () { return policy_1.evaluatePolicy; } });
var registry_1 = require("./registry");
Object.defineProperty(exports, "ToolRegistry", { enumerable: true, get: function () { return registry_1.ToolRegistry; } });
var tools_1 = require("./tools");
Object.defineProperty(exports, "monthlySpendingSummary", { enumerable: true, get: function () { return tools_1.monthlySpendingSummary; } });
Object.defineProperty(exports, "transactionCreate", { enumerable: true, get: function () { return tools_1.transactionCreate; } });
var executor_1 = require("./executor");
Object.defineProperty(exports, "executeTool", { enumerable: true, get: function () { return executor_1.executeTool; } });
var intent_1 = require("./intent");
Object.defineProperty(exports, "resolveIntent", { enumerable: true, get: function () { return intent_1.resolveIntent; } });
var renderer_1 = require("./renderer");
Object.defineProperty(exports, "renderMonthlySpendingSummary", { enumerable: true, get: function () { return renderer_1.renderMonthlySpendingSummary; } });
var bootstrap_1 = require("./bootstrap");
Object.defineProperty(exports, "toolRegistry", { enumerable: true, get: function () { return bootstrap_1.toolRegistry; } });
Object.defineProperty(exports, "handlerRegistry", { enumerable: true, get: function () { return bootstrap_1.handlerRegistry; } });
var conversation_service_1 = require("./conversation.service");
Object.defineProperty(exports, "createAssistantConversationService", { enumerable: true, get: function () { return conversation_service_1.createAssistantConversationService; } });
var application_service_1 = require("./application.service");
Object.defineProperty(exports, "createAssistantApplicationService", { enumerable: true, get: function () { return application_service_1.createAssistantApplicationService; } });
var provider_runtime_1 = require("./provider-runtime");
Object.defineProperty(exports, "createAssistantProviderRuntime", { enumerable: true, get: function () { return provider_runtime_1.createAssistantProviderRuntime; } });
var provider_audit_service_1 = require("./provider-audit.service");
Object.defineProperty(exports, "createAssistantProviderAuditService", { enumerable: true, get: function () { return provider_audit_service_1.createAssistantProviderAuditService; } });
var gemini_provider_1 = require("./providers/gemini.provider");
Object.defineProperty(exports, "createGeminiAssistantProvider", { enumerable: true, get: function () { return gemini_provider_1.createGeminiAssistantProvider; } });
var provider_capability_1 = require("./provider-capability");
Object.defineProperty(exports, "buildProviderCapabilityCatalog", { enumerable: true, get: function () { return provider_capability_1.buildProviderCapabilityCatalog; } });
var provider_instruction_1 = require("./provider-instruction");
Object.defineProperty(exports, "buildAssistantSystemInstruction", { enumerable: true, get: function () { return provider_instruction_1.buildAssistantSystemInstruction; } });
var provider_prompt_1 = require("./provider-prompt");
Object.defineProperty(exports, "assembleAssistantModelRequest", { enumerable: true, get: function () { return provider_prompt_1.assembleAssistantModelRequest; } });
var provider_plan_1 = require("./provider-plan");
Object.defineProperty(exports, "validateAssistantPlan", { enumerable: true, get: function () { return provider_plan_1.validateAssistantPlan; } });
var provider_types_1 = require("./provider-types");
Object.defineProperty(exports, "AssistantProviderError", { enumerable: true, get: function () { return provider_types_1.AssistantProviderError; } });
__exportStar(require("./entity-resolution"), exports);
__exportStar(require("./persistence"), exports);
var clarification_service_1 = require("./clarification.service");
Object.defineProperty(exports, "createClarificationService", { enumerable: true, get: function () { return clarification_service_1.createClarificationService; } });
//# sourceMappingURL=index.js.map
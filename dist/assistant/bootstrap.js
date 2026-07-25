"use strict";
// ============================================================
// Assistant Core — bootstrap
// ------------------------------------------------------------
// Wires the static tool registry and handler registry at
// startup. Import this once during application init to
// register all supported tools.
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assistantProviderRuntime = exports.assistantProviderAuditService = exports.assistantApplicationService = exports.clarificationService = exports.entityResolutionService = exports.assistantFinancialDraftService = exports.assistantContextService = exports.assistantConversationService = exports.entityResolverRegistry = exports.handlerRegistry = exports.toolRegistry = void 0;
const registry_1 = require("./registry");
const tools_1 = require("./tools");
const monthly_spending_summary_handler_1 = require("./handlers/monthly-spending-summary.handler");
const prisma_1 = __importDefault(require("../lib/prisma"));
const conversation_service_1 = require("./conversation.service");
const application_service_1 = require("./application.service");
const financial_draft_service_1 = require("./financial-draft.service");
const transaction_service_1 = require("../services/transaction.service");
const context_service_1 = require("./context.service");
const clarification_service_1 = require("./clarification.service");
const config_1 = require("../config");
const gemini_provider_1 = require("./providers/gemini.provider");
const provider_audit_service_1 = require("./provider-audit.service");
const provider_runtime_1 = require("./provider-runtime");
const entity_resolution_1 = require("./entity-resolution");
/** The application-wide tool registry. Populated at startup. */
exports.toolRegistry = new registry_1.ToolRegistry();
/** The application-wide handler registry. Populated at startup. */
exports.handlerRegistry = new Map();
exports.entityResolverRegistry = new entity_resolution_1.EntityResolverRegistry();
// ---- Register Phase 21.2 tools ---------------------------------------------
exports.toolRegistry.register(tools_1.monthlySpendingSummary);
exports.toolRegistry.register(tools_1.transactionCreate);
exports.handlerRegistry.set(tools_1.monthlySpendingSummary.id, monthly_spending_summary_handler_1.handleMonthlySpendingSummary);
exports.entityResolverRegistry.register((0, entity_resolution_1.createWalletResolver)(prisma_1.default));
exports.entityResolverRegistry.register((0, entity_resolution_1.createMerchantResolver)(prisma_1.default));
exports.entityResolverRegistry.register((0, entity_resolution_1.createCategoryResolver)(prisma_1.default));
exports.entityResolverRegistry.finalize();
exports.assistantConversationService = (0, conversation_service_1.createAssistantConversationService)(prisma_1.default);
exports.assistantContextService = (0, context_service_1.createAssistantContextService)(prisma_1.default);
exports.assistantFinancialDraftService = (0, financial_draft_service_1.createAssistantFinancialDraftService)(prisma_1.default, transaction_service_1.transactionService);
exports.entityResolutionService = (0, entity_resolution_1.createEntityResolutionService)(exports.entityResolverRegistry);
exports.clarificationService = (0, clarification_service_1.createClarificationService)(prisma_1.default);
exports.assistantApplicationService = (0, application_service_1.createAssistantApplicationService)({
    conversations: exports.assistantConversationService,
    contexts: exports.assistantContextService,
    toolRegistry: exports.toolRegistry,
    handlerRegistry: exports.handlerRegistry,
    financialDrafts: exports.assistantFinancialDraftService,
    entityResolution: exports.entityResolutionService,
    clarification: exports.clarificationService,
});
exports.assistantProviderAuditService = (0, provider_audit_service_1.createAssistantProviderAuditService)(prisma_1.default);
exports.assistantProviderRuntime = config_1.assistantProviderConfig.enabled
    ? (0, provider_runtime_1.createAssistantProviderRuntime)({
        application: exports.assistantApplicationService,
        conversations: exports.assistantConversationService,
        provider: (0, gemini_provider_1.createGeminiAssistantProvider)({
            apiKey: config_1.assistantProviderConfig.apiKey,
            model: config_1.assistantProviderConfig.model,
            timeoutMs: config_1.assistantProviderConfig.timeoutMs,
            maxResponseBytes: config_1.assistantProviderConfig.maxResponseBytes,
        }),
        audit: exports.assistantProviderAuditService,
        toolRegistry: exports.toolRegistry,
        timeoutMs: config_1.assistantProviderConfig.timeoutMs,
    })
    : undefined;
//# sourceMappingURL=bootstrap.js.map
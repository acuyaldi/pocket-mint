// ============================================================
// Assistant Core — bootstrap
// ------------------------------------------------------------
// Wires the static tool registry and handler registry at
// startup. Import this once during application init to
// register all supported tools.
// ============================================================

import { ToolRegistry } from './registry';
import { monthlySpendingSummary, transactionCreate } from './tools';
import { handleMonthlySpendingSummary } from './handlers/monthly-spending-summary.handler';
import type { HandlerRegistry } from './executor';
import prisma from '../lib/prisma';
import { createAssistantConversationService } from './conversation.service';
import { createAssistantApplicationService } from './application.service';
import { createAssistantFinancialDraftService } from './financial-draft.service';
import { transactionService } from '../services/transaction.service';
import { createAssistantContextService } from './context.service';
import { createClarificationService } from './clarification.service';
import { assistantProviderConfig } from '../config';
import { createGeminiAssistantProvider } from './providers/gemini.provider';
import { createAssistantProviderAuditService } from './provider-audit.service';
import { createAssistantProviderRuntime } from './provider-runtime';
import {
  EntityResolverRegistry,
  createCategoryResolver,
  createEntityResolutionService,
  createMerchantResolver,
  createWalletResolver,
} from './entity-resolution';

/** The application-wide tool registry. Populated at startup. */
export const toolRegistry = new ToolRegistry();

/** The application-wide handler registry. Populated at startup. */
export const handlerRegistry: HandlerRegistry = new Map();
export const entityResolverRegistry = new EntityResolverRegistry();

// ---- Register Phase 21.2 tools ---------------------------------------------

toolRegistry.register(monthlySpendingSummary);
toolRegistry.register(transactionCreate);
handlerRegistry.set(monthlySpendingSummary.id, handleMonthlySpendingSummary as never);
entityResolverRegistry.register(createWalletResolver(prisma));
entityResolverRegistry.register(createMerchantResolver(prisma));
entityResolverRegistry.register(createCategoryResolver(prisma));
entityResolverRegistry.finalize();

export const assistantConversationService = createAssistantConversationService(prisma);
export const assistantContextService = createAssistantContextService(prisma);
export const assistantFinancialDraftService = createAssistantFinancialDraftService(prisma, transactionService);
export const entityResolutionService = createEntityResolutionService(entityResolverRegistry);
export const clarificationService = createClarificationService(prisma);
export const assistantApplicationService = createAssistantApplicationService({
  conversations: assistantConversationService,
  contexts: assistantContextService,
  toolRegistry,
  handlerRegistry,
  financialDrafts: assistantFinancialDraftService,
  entityResolution: entityResolutionService,
  clarification: clarificationService,
});
export const assistantProviderAuditService = createAssistantProviderAuditService(prisma);
export const assistantProviderRuntime = assistantProviderConfig.enabled
  ? createAssistantProviderRuntime({
    application: assistantApplicationService,
    conversations: assistantConversationService,
    provider: createGeminiAssistantProvider({
      apiKey: assistantProviderConfig.apiKey!,
      model: assistantProviderConfig.model!,
      timeoutMs: assistantProviderConfig.timeoutMs,
      maxResponseBytes: assistantProviderConfig.maxResponseBytes,
    }),
    audit: assistantProviderAuditService,
    toolRegistry,
    timeoutMs: assistantProviderConfig.timeoutMs,
  })
  : undefined;

import { AssistantError } from './errors';
import { executeTool, type HandlerRegistry } from './executor';
import { resolveIntent } from './intent';
import { renderMonthlySpendingSummary } from './renderer';
import type { ToolRegistry } from './registry';
import type { AssistantCanonicalRequest, AssistantCanonicalResponse } from './types';
import type { AssistantConversationService } from './conversation.service';
import { assertAssistantMessageLength, monthlySummaryFallback, monthlySummaryInputForAudit, monthlySummaryOutputForAudit, normalizeProvidedMessage, safeRejectedAssistantMessage, safeRejectedUserMessage, SAFE_REJECTED_INTENT } from './persistence';
import { evaluatePolicy } from './policy';
import { logger } from '../utils/logger';
import type {
  TransactionCreateInput,
  TransactionCreateReferenceInput,
  TransactionCreateToolInput,
} from './tools';
import type { AssistantFinancialDraftService } from './financial-draft.service';
import type { AssistantContextService, BuildAssistantExecutionContextInput } from './context.service';
import {
  WALLET_TRANSACTION_CREATE_CONSTRAINTS,
  MERCHANT_TRANSACTION_CREATE_CONSTRAINTS,
  categoryConstraintsForType,
  toPublicEntityResolutionResult,
  type EntityResolutionResult,
  type EntityResolutionService,
} from './entity-resolution';
import type { ClarificationService } from './clarification.service';
import type { CanonicalContext } from './clarification.types';

export interface AssistantApplicationResult { response: AssistantCanonicalResponse; httpStatus: number }

export function createAssistantApplicationService(deps: {
  conversations: AssistantConversationService;
  contexts?: AssistantContextService;
  toolRegistry: ToolRegistry;
  handlerRegistry: HandlerRegistry;
  financialDrafts?: AssistantFinancialDraftService;
  entityResolution?: EntityResolutionService;
  clarification?: ClarificationService;
}) {
  async function prepareProviderExecution(input: BuildAssistantExecutionContextInput) {
    if (!deps.contexts) throw new Error('Assistant context service is not configured');
    return deps.contexts.buildExecutionContext(input);
  }

  // ---- Canonical trusted context -------------------------------------------

  function buildCanonicalContext(
    input: TransactionCreateToolInput,
    wallet?: { internalId: string; displayLabel: string },
    merchant?: { internalId: string; displayLabel: string },
    category?: { internalId: string; displayLabel: string; categoryType: string },
  ): CanonicalContext {
    const categoryId = 'categoryId' in input ? (input as { categoryId: string }).categoryId : undefined;
    const refInput = input as { merchantReference?: string; categoryReference?: string };
    return {
      version: 1,
      operation: 'transaction.create',
      type: input.type,
      amount: input.amount,
      date: input.date,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(wallet ? { wallet } : {}),
      ...(merchant ? { merchant } : {}),
      ...(category ? { category } : categoryId ? { category: { internalId: categoryId, displayLabel: '', categoryType: input.type } } : {}),
      ...(refInput.merchantReference ? { merchantReference: refInput.merchantReference } : {}),
      ...(refInput.categoryReference ? { categoryReference: refInput.categoryReference } : {}),
      resumeAt: new Date().toISOString(),
    };
  }

  // ---- Entity resolution helpers -------------------------------------------

  type EntityKind = 'wallet' | 'merchant' | 'category';

  interface ResolvedWallet { internalId: string; displayLabel: string }
  interface ResolvedMerchant { internalId: string; displayLabel: string }
  interface ResolvedCategory { internalId: string; displayLabel: string; categoryType: string }

  async function resolveEntity(
    userId: string,
    entityType: EntityKind,
    referenceText: string,
    transactionType?: 'INCOME' | 'EXPENSE',
  ): Promise<EntityResolutionResult> {
    if (!deps.entityResolution) {
      // Gracefully skip resolution when not wired (e.g. direct-ID only paths)
      return { kind: 'not_found', entityType, normalizedReference: referenceText };
    }

    const constraints = entityType === 'wallet'
      ? WALLET_TRANSACTION_CREATE_CONSTRAINTS
      : entityType === 'merchant'
        ? MERCHANT_TRANSACTION_CREATE_CONSTRAINTS
        : categoryConstraintsForType(transactionType ?? 'EXPENSE');

    return deps.entityResolution.resolve({
      authenticatedUserId: userId,
      reference: {
        entityType,
        referenceText,
        source: 'provider_extracted',
      },
      trustedConstraints: constraints,
    });
  }

  // ---- Clarification creation helper ---------------------------------------

  async function createEntityClarification(params: {
    userId: string;
    conversationId: string;
    turnId: string;
    executionId: string;
    entityType: EntityKind;
    trustedContext: CanonicalContext;
    resolution: Extract<EntityResolutionResult, { kind: 'ambiguous' }>;
    parentClarificationId?: string;
  }) {
    if (!deps.clarification) throw new Error('Clarification service is not configured');

    const prompt = renderEntityClarificationPrompt(params.entityType, params.resolution);
    return deps.clarification.create({
      userId: params.userId,
      conversationId: params.conversationId,
      turnId: params.turnId,
      executionId: params.executionId,
      entityType: params.entityType,
      trustedContext: params.trustedContext,
      prompt,
      parentClarificationId: params.parentClarificationId,
      options: params.resolution.options.map((opt) => ({
        displayLabel: opt.displayLabel,
        discriminator: opt.discriminator,
        candidateId: opt.selection.internalId,
      })),
    });
  }

  function clarificationResponse(
    turn: { conversationId: string; turnId: string },
    executionId: string,
    correlationId: string,
    startedAt: number,
    projection: Awaited<ReturnType<NonNullable<typeof deps.clarification>['create']>>,
    entityType: EntityKind,
  ): AssistantApplicationResult {
    return {
      httpStatus: 200,
      response: {
        status: 'clarification_required',
        message: projection.prompt,
        data: { kind: 'ambiguous' as const, entityType, clarification: projection },
        correlationId, ...turn,
      },
    };
  }

  // ---- Main execute ---------------------------------------------------------

  async function execute(userId: string, correlationId: string, request: AssistantCanonicalRequest): Promise<AssistantApplicationResult> {
    const locale = request.locale?.trim() || 'id-ID';
    if (request.conversationId) await deps.conversations.assertContinuable(userId, request.conversationId);
    const provided = normalizeProvidedMessage(request.message);
    let resolved: ReturnType<typeof resolveIntent>;
    let validatedInput: { month: string } | TransactionCreateToolInput;
    try {
      resolved = resolveIntent(request);
      const contract = deps.toolRegistry.get(resolved.toolId);
      if (!contract) throw AssistantError.toolNotFound(resolved.toolId);
      validatedInput = contract.validateInput(resolved.arguments) as
        | { month: string }
        | TransactionCreateToolInput;
    } catch (error) {
      const operational = error instanceof AssistantError ? error : AssistantError.invalidRequest('request cannot be validated');
      const safeMessage = safeRejectedAssistantMessage(operational.code);
      const turn = await deps.conversations.beginTurn({ userId, conversationId: request.conversationId, correlationId, intent: SAFE_REJECTED_INTENT, locale, content: safeRejectedUserMessage(), source: 'SAFE_REQUEST_SUMMARY' });
      await deps.conversations.finalizeRejected({ ...turn, content: safeMessage, safeErrorCode: operational.code });
      return { httpStatus: operational.statusCode, response: { status: 'rejected', code: operational.code, message: safeMessage, correlationId, ...turn } };
    }
    const fallback = request.intent === 'transaction.create' ? 'Siapkan draft transaksi untuk konfirmasi.' : monthlySummaryFallback(validatedInput as { month: string });
    const turn = await deps.conversations.beginTurn({ userId, conversationId: request.conversationId, correlationId, intent: request.intent, locale, content: provided ?? fallback, source: provided ? 'USER_PROVIDED' : 'CANONICAL_FALLBACK' });
    await deps.conversations.markTurnRunning(turn.turnId);
    const contract = deps.toolRegistry.get(resolved.toolId)!;
    const policy = evaluatePolicy(contract);
    const redactedInput = request.intent === 'transaction.create' ? { operation: 'transaction.create' } : monthlySummaryInputForAudit(validatedInput as { month: string });
    const executionId = await deps.conversations.beginToolExecution({ ...turn, correlationId, toolId: contract.id, capability: contract.capability, riskLevel: contract.riskLevel, policyDecision: policy.action, redactedInput });
    const startedAt = Date.now();

    if (policy.action === 'DRAFT_AND_CONFIRM') {
      return executeTransactionCreate(userId, correlationId, turn, executionId, startedAt, validatedInput as TransactionCreateToolInput);
    }
    return executeAnalytics(userId, correlationId, turn, executionId, startedAt, resolved.toolId, validatedInput as { month: string });
  }

  // ---- Transaction create with sequential clarification ---------------------

  async function executeTransactionCreate(
    userId: string,
    correlationId: string,
    turn: { conversationId: string; turnId: string },
    executionId: string,
    startedAt: number,
    transactionInput: TransactionCreateToolInput,
  ): Promise<AssistantApplicationResult> {
    if (!deps.financialDrafts) throw new Error('Financial draft service is not configured');

    // Step 1: Resolve wallet
    const hasWalletRef = 'walletReference' in transactionInput;
    let walletData: ResolvedWallet | undefined;
    let lastClarificationId: string | undefined;

    if (hasWalletRef) {
      const ref = (transactionInput as { walletReference: string }).walletReference;
      const walletResult = await resolveEntity(userId, 'wallet', ref);

      if (walletResult.kind === 'ambiguous') {
        const canonical = buildCanonicalContext(transactionInput);
        const projection = await createEntityClarification({
          userId, conversationId: turn.conversationId, turnId: turn.turnId,
          executionId, entityType: 'wallet', trustedContext: canonical,
          resolution: walletResult as Extract<EntityResolutionResult, { kind: 'ambiguous' }>,
        });
        lastClarificationId = projection.clarificationId;
        await deps.conversations.finalize({
          executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'CLARIFICATION_REQUIRED',
          assistantContent: projection.prompt, assistantSource: 'DETERMINISTIC_RENDERER',
          durationMs: Date.now() - startedAt,
          outputSummary: { operation: 'transaction.create', walletResolution: 'ambiguous', clarificationId: projection.clarificationId },
        });
        return clarificationResponse(turn, executionId, correlationId, startedAt, projection, 'wallet');
      }
      if (walletResult.kind === 'not_found') {
        const message = renderWalletNotFound(walletResult);
        await deps.conversations.finalize({
          executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'CLARIFICATION_REQUIRED',
          assistantContent: message, assistantSource: 'DETERMINISTIC_RENDERER',
          durationMs: Date.now() - startedAt,
          outputSummary: { operation: 'transaction.create', walletResolution: 'not_found' },
        });
        return { httpStatus: 200, response: { status: 'clarification_required', message, data: toPublicEntityResolutionResult(walletResult), correlationId, ...turn } };
      }
      if (walletResult.kind !== 'resolved') {
        const invalid = AssistantError.invalidInput('transaction.create', 'walletReference is invalid');
        const safeMessage = safeRejectedAssistantMessage(invalid.code);
        await deps.conversations.finalize({
          executionId, ...turn, status: 'FAILED', turnStatus: 'REJECTED',
          assistantContent: safeMessage, assistantSource: 'SAFE_ERROR',
          durationMs: Date.now() - startedAt, safeErrorCode: invalid.code,
          outputSummary: { operation: 'transaction.create', walletResolution: walletResult.kind },
        });
        return { httpStatus: invalid.statusCode, response: { status: 'rejected', code: invalid.code, message: safeMessage, correlationId, ...turn } };
      }
      walletData = { internalId: walletResult.entity.internalId, displayLabel: walletResult.displayLabel };
    }

    // Step 2: Resolve merchant (from merchantReference, or description)
    const merchantRef = (transactionInput as { merchantReference?: string }).merchantReference
      ?? (deps.entityResolution ? transactionInput.description : undefined)
      ?? '';
    let merchantData: ResolvedMerchant | undefined;

    if (merchantRef && deps.entityResolution) {
      const merchantResult = await resolveEntity(userId, 'merchant', merchantRef);

      if (merchantResult.kind === 'ambiguous') {
        const canonical = buildCanonicalContext(transactionInput, walletData);
        const projection = await createEntityClarification({
          userId, conversationId: turn.conversationId, turnId: turn.turnId,
          executionId, entityType: 'merchant', trustedContext: canonical,
          resolution: merchantResult as Extract<EntityResolutionResult, { kind: 'ambiguous' }>,
          parentClarificationId: lastClarificationId,
        });
        lastClarificationId = projection.clarificationId;
        await deps.conversations.finalize({
          executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'CLARIFICATION_REQUIRED',
          assistantContent: projection.prompt, assistantSource: 'DETERMINISTIC_RENDERER',
          durationMs: Date.now() - startedAt,
          outputSummary: { operation: 'transaction.create', merchantResolution: 'ambiguous', clarificationId: projection.clarificationId },
        });
        return clarificationResponse(turn, executionId, correlationId, startedAt, projection, 'merchant');
      }
      if (merchantResult.kind === 'resolved') {
        merchantData = { internalId: merchantResult.entity.internalId, displayLabel: merchantResult.displayLabel };
      }
      if (merchantResult.kind === 'not_found') {
        // Reject unsafe markup in free-form merchant references
        const normalized = (merchantResult as { normalizedReference?: string }).normalizedReference ?? merchantRef;
        if (/<[^>]*>/.test(normalized)) {
          const invalid = AssistantError.invalidInput('transaction.create', 'merchantReference contains unsafe content');
          const safeMsg2 = safeRejectedAssistantMessage(invalid.code);
          await deps.conversations.finalize({
            executionId, ...turn, status: 'FAILED', turnStatus: 'REJECTED',
            assistantContent: safeMsg2, assistantSource: 'SAFE_ERROR',
            durationMs: Date.now() - startedAt, safeErrorCode: invalid.code,
            outputSummary: { operation: 'transaction.create', merchantResolution: 'invalid' },
          });
          return { httpStatus: invalid.statusCode, response: { status: 'error', code: invalid.code, message: safeMsg2, correlationId, ...turn } };
        }
      }
      // not_found: continue with free-form merchant (no clarification)
    }

    // Step 3: Resolve category (from categoryReference if present)
    const categoryRef = (transactionInput as { categoryReference?: string }).categoryReference;
    let categoryData: ResolvedCategory | undefined;

    if (categoryRef) {
      const categoryResult = await resolveEntity(userId, 'category', categoryRef, transactionInput.type);

      if (categoryResult.kind === 'ambiguous') {
        const canonical = buildCanonicalContext(transactionInput, walletData, merchantData);
        const projection = await createEntityClarification({
          userId, conversationId: turn.conversationId, turnId: turn.turnId,
          executionId, entityType: 'category', trustedContext: canonical,
          resolution: categoryResult as Extract<EntityResolutionResult, { kind: 'ambiguous' }>,
          parentClarificationId: lastClarificationId,
        });
        lastClarificationId = projection.clarificationId;
        await deps.conversations.finalize({
          executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'CLARIFICATION_REQUIRED',
          assistantContent: projection.prompt, assistantSource: 'DETERMINISTIC_RENDERER',
          durationMs: Date.now() - startedAt,
          outputSummary: { operation: 'transaction.create', categoryResolution: 'ambiguous', clarificationId: projection.clarificationId },
        });
        return clarificationResponse(turn, executionId, correlationId, startedAt, projection, 'category');
      }
      if (categoryResult.kind === 'resolved') {
        categoryData = { internalId: categoryResult.entity.internalId, displayLabel: categoryResult.displayLabel, categoryType: transactionInput.type };
      } else if (categoryResult.kind === 'not_found') {
        const message = renderCategoryNotFound(categoryResult);
        await deps.conversations.finalize({
          executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'CLARIFICATION_REQUIRED',
          assistantContent: message, assistantSource: 'DETERMINISTIC_RENDERER',
          durationMs: Date.now() - startedAt,
          outputSummary: { operation: 'transaction.create', categoryResolution: 'not_found' },
        });
        return { httpStatus: 200, response: { status: 'clarification_required', message, data: toPublicEntityResolutionResult(categoryResult), correlationId, ...turn } };
      } else {
        // Any other kind is an invalid reference — reject before drafting
        const invalid = AssistantError.invalidInput('transaction.create', 'categoryReference is invalid');
        const safeMsg = safeRejectedAssistantMessage(invalid.code);
        await deps.conversations.finalize({
          executionId, ...turn, status: 'FAILED', turnStatus: 'REJECTED',
          assistantContent: safeMsg, assistantSource: 'SAFE_ERROR',
          durationMs: Date.now() - startedAt, safeErrorCode: invalid.code,
          outputSummary: { operation: 'transaction.create', categoryResolution: categoryResult.kind },
        });
        return { httpStatus: invalid.statusCode, response: { status: 'rejected', code: invalid.code, message: safeMsg, correlationId, ...turn } };
      }
    }

    // All resolved — create draft
    return finalizeTransactionDraft(userId, correlationId, turn, executionId, startedAt, transactionInput, walletData, merchantData, categoryData);
  }

  // ---- Finalize transaction draft -------------------------------------------

  async function finalizeTransactionDraft(
    userId: string,
    correlationId: string,
    turn: { conversationId: string; turnId: string },
    executionId: string,
    startedAt: number,
    transactionInput: TransactionCreateToolInput,
    walletData?: ResolvedWallet,
    _merchantData?: ResolvedMerchant,
    categoryData?: ResolvedCategory,
  ): Promise<AssistantApplicationResult> {
    if (!deps.financialDrafts) throw new Error('Financial draft service is not configured');

    const walletId = walletData?.internalId ?? (transactionInput as TransactionCreateInput).walletId;
    const categoryId = categoryData?.internalId ?? (transactionInput as { categoryId: string }).categoryId;
    const draftInput: TransactionCreateInput = {
      type: transactionInput.type,
      amount: transactionInput.amount,
      walletId,
      categoryId,
      date: transactionInput.date,
      ...(transactionInput.description === undefined ? {} : { description: transactionInput.description }),
    };

    try {
      const draft = await deps.financialDrafts.prepare({
        ...draftInput,
        ...(walletData === undefined ? {} : { walletDisplayLabel: walletData.displayLabel }),
        userId,
        ...turn,
        executionId,
      });
      await deps.conversations.finalize({
        executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'SUCCEEDED',
        assistantContent: draft.renderedText, assistantSource: 'DETERMINISTIC_RENDERER',
        durationMs: Date.now() - startedAt,
        outputSummary: { draftId: draft.draftId, operation: 'transaction.create', status: 'PENDING_CONFIRMATION' },
      });
      return { httpStatus: 200, response: { status: 'success', renderedText: draft.renderedText, data: draft, correlationId, ...turn } };
    } catch (error) {
      const operational = error instanceof AssistantError ? error : { message: 'Assistant draft preparation failed', statusCode: 500, code: 'ASSISTANT_DRAFT_PREPARATION_FAILED' };
      await deps.conversations.finalize({
        executionId, ...turn, status: 'FAILED', turnStatus: 'FAILED',
        assistantContent: operational.message, assistantSource: 'SAFE_ERROR',
        durationMs: Date.now() - startedAt, safeErrorCode: operational.code,
      }).catch(() => undefined);
      return { httpStatus: operational.statusCode, response: { status: 'error', code: operational.code, message: operational.message, correlationId, ...turn } };
    }
  }

  // ---- Clarification selection (sequential continuation) --------------------

  async function selectClarification(
    userId: string,
    correlationId: string,
    token: string,
    conversationId: string,
  ): Promise<AssistantApplicationResult> {
    if (!deps.clarification) throw new Error('Clarification service is not configured');
    if (!deps.financialDrafts) throw new Error('Financial draft service is not configured');

    const startedAt = Date.now();
    const locale = 'id-ID';

    const turn = await deps.conversations.beginTurn({
      userId, conversationId, correlationId,
      intent: 'clarification.select',
      locale,
      content: 'Pilih opsi klarifikasi.',
      source: 'USER_PROVIDED',
    });
    await deps.conversations.markTurnRunning(turn.turnId);

    const executionId = await deps.conversations.beginToolExecution({
      ...turn, correlationId, toolId: 'clarification.select',
      capability: 'transaction.create', riskLevel: 'HIGH',
      policyDecision: 'EXPLICIT',
      redactedInput: { operation: 'clarification.select' },
    });

    try {
      const result = await deps.clarification.select({
        userId, conversationId, token, correlationId,
      });

      const ctx = result.trustedContext;
      const walletData: ResolvedWallet | undefined = result.entityType === 'wallet'
        ? { internalId: result.selectedCandidateId, displayLabel: result.selectedDisplayLabel }
        : (ctx.wallet ? { internalId: ctx.wallet.internalId, displayLabel: ctx.wallet.displayLabel } : undefined);
      const merchantData: ResolvedMerchant | undefined = result.entityType === 'merchant'
        ? { internalId: result.selectedCandidateId, displayLabel: result.selectedDisplayLabel }
        : (ctx.merchant ? { internalId: ctx.merchant.internalId, displayLabel: ctx.merchant.displayLabel } : undefined);
      const categoryData: ResolvedCategory | undefined = result.entityType === 'category'
        ? { internalId: result.selectedCandidateId, displayLabel: result.selectedDisplayLabel, categoryType: ctx.type }
        : undefined;

      const txInput = buildTransactionInput(ctx, walletData);
      const nextEntity: EntityKind | null = result.entityType === 'wallet' ? 'merchant'
        : result.entityType === 'merchant' ? 'category'
        : null;

      // After wallet: try resolving merchant (from merchantReference, or description)
      if (nextEntity === 'merchant') {
        const ref = ctx.merchantReference ?? ctx.description ?? '';
        if (ref) {
          const mr = await resolveEntity(userId, 'merchant', ref);
          if (mr.kind === 'ambiguous') {
            const projection = await createEntityClarification({
              userId, conversationId, turnId: turn.turnId,
              executionId, entityType: 'merchant',
              trustedContext: buildCanonicalContext(txInput, walletData),
              resolution: mr as Extract<EntityResolutionResult, { kind: 'ambiguous' }>,
              parentClarificationId: result.clarificationId,
            });
            await deps.conversations.finalize({
              executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'CLARIFICATION_REQUIRED',
              assistantContent: projection.prompt, assistantSource: 'DETERMINISTIC_RENDERER',
              durationMs: Date.now() - startedAt,
              outputSummary: { operation: 'transaction.create', merchantResolution: 'ambiguous', clarificationId: projection.clarificationId },
            });
            return clarificationResponse(turn, executionId, correlationId, startedAt, projection, 'merchant');
          }
          // resolved or not_found: continue to category
          if (mr.kind === 'resolved') {
            return continueToCategory(userId, correlationId, turn, executionId, startedAt, txInput, walletData, { internalId: mr.entity.internalId, displayLabel: mr.displayLabel });
          }
          // not_found: free-form merchant, continue to category
          return continueToCategory(userId, correlationId, turn, executionId, startedAt, txInput, walletData, undefined);
        }
        // no merchant reference: skip to category
        return continueToCategory(userId, correlationId, turn, executionId, startedAt, txInput, walletData, undefined);
      }

      // After merchant: resolve category
      if (nextEntity === 'category') {
        return continueToCategory(userId, correlationId, turn, executionId, startedAt, txInput, walletData, merchantData, result.clarificationId);
      }

      // After category or no more entities: create draft
      return finalizeTransactionDraft(userId, correlationId, turn, executionId, startedAt, txInput, walletData, merchantData, categoryData);
    } catch (error) {
      const operational = error instanceof AssistantError ? error : { message: 'Clarification selection failed', statusCode: 500, code: 'ASSISTANT_CLARIFICATION_FAILED' };
      await deps.conversations.finalize({
        executionId, ...turn, status: 'FAILED', turnStatus: 'FAILED',
        assistantContent: operational.message, assistantSource: 'SAFE_ERROR',
        durationMs: Date.now() - startedAt, safeErrorCode: operational.code,
      }).catch(() => undefined);
      return { httpStatus: operational.statusCode, response: { status: 'error', code: operational.code, message: operational.message, correlationId, ...turn } };
    }
  }

  // ---- Continue to category after merchant resolution -----------------------

  async function continueToCategory(
    userId: string,
    correlationId: string,
    turn: { conversationId: string; turnId: string },
    executionId: string,
    startedAt: number,
    txInput: TransactionCreateToolInput,
    walletData?: ResolvedWallet,
    merchantData?: ResolvedMerchant,
    parentClarificationId?: string,
  ): Promise<AssistantApplicationResult> {
    // Only resolve category if categoryReference is explicitly provided.
    // Otherwise, use the direct categoryId from the input context.
    const categoryRef = (txInput as { categoryReference?: string }).categoryReference;
    if (categoryRef) {
      const cr = await resolveEntity(userId, 'category', categoryRef, txInput.type);
      if (cr.kind === 'ambiguous') {
        const projection = await createEntityClarification({
          userId, conversationId: turn.conversationId, turnId: turn.turnId,
          executionId, entityType: 'category',
          trustedContext: buildCanonicalContext(txInput, walletData, merchantData),
          resolution: cr as Extract<EntityResolutionResult, { kind: 'ambiguous' }>,
          parentClarificationId,
        });
        await deps.conversations.finalize({
          executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'CLARIFICATION_REQUIRED',
          assistantContent: projection.prompt, assistantSource: 'DETERMINISTIC_RENDERER',
          durationMs: Date.now() - startedAt,
          outputSummary: { operation: 'transaction.create', categoryResolution: 'ambiguous', clarificationId: projection.clarificationId },
        });
        return clarificationResponse(turn, executionId, correlationId, startedAt, projection, 'category');
      }
      if (cr.kind === 'resolved') {
        return finalizeTransactionDraft(userId, correlationId, turn, executionId, startedAt, txInput, walletData, merchantData,
          { internalId: cr.entity.internalId, displayLabel: cr.displayLabel, categoryType: txInput.type });
      }
      if (cr.kind === 'not_found') {
        const message = renderCategoryNotFound(cr);
        await deps.conversations.finalize({
          executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'CLARIFICATION_REQUIRED',
          assistantContent: message, assistantSource: 'DETERMINISTIC_RENDERER',
          durationMs: Date.now() - startedAt,
          outputSummary: { operation: 'transaction.create', categoryResolution: 'not_found' },
        });
        return { httpStatus: 200, response: { status: 'clarification_required', message, data: toPublicEntityResolutionResult(cr), correlationId, ...turn } };
      }
    }
    // No category reference: use direct categoryId from input → draft
    return finalizeTransactionDraft(userId, correlationId, turn, executionId, startedAt, txInput, walletData, merchantData, undefined);
  }

  // ---- Helper: reconstruct TransactionCreateToolInput from context ----------

  function buildTransactionInput(
    ctx: CanonicalContext,
    walletData?: ResolvedWallet,
  ): TransactionCreateToolInput {
    const base = {
      type: ctx.type,
      amount: ctx.amount,
      date: ctx.date,
      ...(ctx.description ? { description: ctx.description } : {}),
      ...(ctx.merchantReference ? { merchantReference: ctx.merchantReference } : {}),
      ...(ctx.categoryReference ? { categoryReference: ctx.categoryReference } : {}),
    };
    if (walletData) {
      return { ...base, walletId: walletData.internalId, categoryId: ctx.category?.internalId ?? '' } as TransactionCreateInput;
    }
    return {
      ...base,
      walletReference: '',
      categoryId: ctx.category?.internalId ?? '',
    } as TransactionCreateReferenceInput;
  }

  // ---- Cancel clarification -------------------------------------------------

  async function cancelClarification(
    userId: string,
    correlationId: string,
    clarificationId: string,
    conversationId: string,
  ): Promise<AssistantApplicationResult> {
    if (!deps.clarification) throw new Error('Clarification service is not configured');

    const locale = 'id-ID';
    const turn = await deps.conversations.beginTurn({
      userId, conversationId, correlationId,
      intent: 'clarification.cancel',
      locale,
      content: 'Batalkan klarifikasi.',
      source: 'USER_PROVIDED',
    });
    await deps.conversations.markTurnRunning(turn.turnId);

    try {
      await deps.clarification.cancel({ userId, clarificationId, reason: 'user_cancelled' });
      const message = 'Klarifikasi dibatalkan. Silakan mulai ulang pembuatan transaksi.';
      await deps.conversations.finalizeWithoutTool({
        ...turn,
        turnStatus: 'SUCCEEDED',
        assistantContent: message,
        assistantSource: 'DETERMINISTIC_RENDERER',
      });
      return { httpStatus: 200, response: { status: 'success', renderedText: message, data: { clarificationId, status: 'CANCELLED' }, correlationId, ...turn } };
    } catch (error) {
      const operational = error instanceof AssistantError ? error : { message: 'Clarification cancellation failed', statusCode: 500, code: 'ASSISTANT_CLARIFICATION_FAILED' };
      await deps.conversations.finalizeWithoutTool({
        ...turn,
        turnStatus: 'FAILED',
        assistantContent: operational.message,
        assistantSource: 'SAFE_ERROR',
        safeErrorCode: operational.code,
      }).catch(() => undefined);
      return { httpStatus: operational.statusCode, response: { status: 'error', code: operational.code, message: operational.message, correlationId, ...turn } };
    }
  }

  // ---- Get assistant state --------------------------------------------------

  async function getAssistantState(userId: string, conversationId: string) {
    if (!deps.clarification) return {};
    return deps.clarification.getAssistantState(userId, conversationId);
  }

  // ---- Analytics flow (unchanged) -------------------------------------------

  async function executeAnalytics(
    userId: string,
    correlationId: string,
    turn: { conversationId: string; turnId: string },
    executionId: string,
    startedAt: number,
    toolId: string,
    validatedInput: { month: string },
  ): Promise<AssistantApplicationResult> {
    let result: Awaited<ReturnType<typeof executeTool>>;
    try {
      result = await executeTool(toolId, validatedInput, { userId, correlationId, ...turn, timestamp: new Date() }, deps.toolRegistry, deps.handlerRegistry);
    } catch (error) {
      const operational = error instanceof AssistantError ? error : { message: 'Assistant execution failed', statusCode: 500, code: 'ASSISTANT_EXECUTION_FAILED' };
      const status = operational.code === 'ASSISTANT_EXECUTION_TIMEOUT' ? 'TIMED_OUT'
        : operational.code === 'ASSISTANT_POLICY_DENIED' || operational.code === 'ASSISTANT_TOOL_DISABLED' ? 'DENIED'
        : 'FAILED';
      await deps.conversations.finalize({ executionId, ...turn, status, turnStatus: 'FAILED', assistantContent: operational.message, assistantSource: 'SAFE_ERROR', durationMs: Date.now() - startedAt, safeErrorCode: operational.code }).catch(() => undefined);
      return { httpStatus: operational.statusCode, response: { status: 'error', code: operational.code, message: operational.message, correlationId, ...turn } };
    }
    const renderedText = assertAssistantMessageLength(renderMonthlySpendingSummary(result.output as never));
    try {
      await deps.conversations.finalize({ executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'SUCCEEDED', assistantContent: renderedText, assistantSource: 'DETERMINISTIC_RENDERER', durationMs: result.durationMs, outputSummary: monthlySummaryOutputForAudit(result.output as never) });
    } catch (error) {
      logger.error('assistant_finalization_failed', { correlationId, conversationId: turn.conversationId, turnId: turn.turnId });
      throw error;
    }
    return { httpStatus: 200, response: { status: 'success', renderedText, data: result.output, correlationId, ...turn } };
  }

  return { execute, prepareProviderExecution, selectClarification, cancelClarification, getAssistantState };
}

export type AssistantApplicationService = ReturnType<typeof createAssistantApplicationService>;

// ---- Render helpers ----------------------------------------------------------

function renderEntityClarificationPrompt(
  entityType: 'wallet' | 'merchant' | 'category',
  resolution: Extract<EntityResolutionResult, { kind: 'ambiguous' }>,
): string {
  const label = entityType === 'wallet' ? 'Wallet' : entityType === 'merchant' ? 'Pedagang' : 'Kategori';
  const options = resolution.options
    .map((opt) =>
      opt.discriminator
        ? `${opt.displayLabel} (${opt.discriminator})`
        : opt.displayLabel,
    )
    .join(', ');
  return `${label} yang dimaksud belum jelas. Pilih salah satu: ${options}.`;
}

function renderWalletNotFound(
  resolution: Extract<EntityResolutionResult, { kind: 'not_found' }>,
): string {
  return 'Wallet tersebut tidak ditemukan atau tidak dapat digunakan. Sebutkan nama wallet aktif yang lain.';
}

function renderCategoryNotFound(
  _resolution: Extract<EntityResolutionResult, { kind: 'not_found' }>,
): string {
  return 'Kategori tidak ditemukan. Silakan mulai ulang pembuatan transaksi dengan kategori yang valid.';
}

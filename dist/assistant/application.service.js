"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAssistantApplicationService = createAssistantApplicationService;
const errors_1 = require("./errors");
const executor_1 = require("./executor");
const intent_1 = require("./intent");
const renderer_1 = require("./renderer");
const persistence_1 = require("./persistence");
const policy_1 = require("./policy");
const logger_1 = require("../utils/logger");
const entity_resolution_1 = require("./entity-resolution");
const config_1 = require("../config");
const reportingTime_1 = require("../domain/reportingTime");
/**
 * Catch-all category seeded for every user in both directions by
 * `DEFAULT_CATEGORIES` (`services/category.service.ts`). Used as the last
 * deterministic step before giving up on a category, so a missing category
 * never becomes a conversation turn.
 */
const FALLBACK_CATEGORY_NAME = 'Lainnya';
function createAssistantApplicationService(deps) {
    async function prepareProviderExecution(input) {
        if (!deps.contexts)
            throw new Error('Assistant context service is not configured');
        return deps.contexts.buildExecutionContext(input);
    }
    // ---- Canonical trusted context -------------------------------------------
    function buildCanonicalContext(input, wallet, merchant, category) {
        const categoryId = 'categoryId' in input ? input.categoryId : undefined;
        const refInput = input;
        return {
            version: 1,
            operation: 'transaction.create',
            type: input.type,
            amount: input.amount,
            ...(input.date ? { date: input.date } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(wallet ? { wallet } : {}),
            ...(merchant ? { merchant } : {}),
            ...(category ? { category } : categoryId ? { category: { internalId: categoryId, displayLabel: '', categoryType: input.type } } : {}),
            ...(refInput.merchantReference ? { merchantReference: refInput.merchantReference } : {}),
            ...(refInput.categoryReference ? { categoryReference: refInput.categoryReference } : {}),
            resumeAt: new Date().toISOString(),
        };
    }
    async function resolveEntity(userId, entityType, referenceText, transactionType, transaction) {
        if (!deps.entityResolution) {
            // Gracefully skip resolution when not wired (e.g. direct-ID only paths)
            return { kind: 'not_found', entityType, normalizedReference: referenceText };
        }
        const constraints = entityType === 'wallet'
            ? entity_resolution_1.WALLET_TRANSACTION_CREATE_CONSTRAINTS
            : entityType === 'merchant'
                ? entity_resolution_1.MERCHANT_TRANSACTION_CREATE_CONSTRAINTS
                : (0, entity_resolution_1.categoryConstraintsForType)(transactionType ?? 'EXPENSE');
        return deps.entityResolution.resolve({
            authenticatedUserId: userId,
            reference: {
                entityType,
                referenceText,
                source: 'provider_extracted',
            },
            trustedConstraints: constraints,
            ...(transaction ? { transaction } : {}),
        });
    }
    // ---- Clarification creation helper ---------------------------------------
    async function createEntityClarification(params) {
        if (!deps.clarification)
            throw new Error('Clarification service is not configured');
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
        }, ...(params.transaction ? [{ transaction: params.transaction }] : []));
    }
    function clarificationResponse(turn, executionId, correlationId, startedAt, projection, entityType) {
        return {
            httpStatus: 200,
            response: {
                status: 'clarification_required',
                message: projection.prompt,
                data: { kind: 'entity_selection', entityType, clarification: projection },
                correlationId, ...turn,
            },
        };
    }
    // ---- Deterministic category inference -------------------------------------
    // Category is never a blocking question: a high/medium-confidence keyword or
    // merchant-mapping suggestion wins, otherwise the user's catch-all category.
    // Both are backend-owned, owner-scoped reads — the user corrects the result on
    // the draft instead of answering a prompt before seeing one.
    async function inferCategoryId(userId, type, hint, transaction) {
        const trimmedHint = hint?.trim();
        if (deps.categorization && trimmedHint) {
            const [best] = await deps.categorization.getSuggestions(userId, trimmedHint, type, transaction ? { transaction } : {});
            if (best && best.confidence !== 'LOW')
                return best.categoryId;
        }
        const fallback = await resolveEntity(userId, 'category', FALLBACK_CATEGORY_NAME, type, transaction);
        return fallback.kind === 'resolved' ? fallback.entity.internalId : undefined;
    }
    // ---- Main execute ---------------------------------------------------------
    async function execute(userId, correlationId, request) {
        const locale = request.locale?.trim() || 'id-ID';
        if (request.conversationId)
            await deps.conversations.assertContinuable(userId, request.conversationId);
        const provided = (0, persistence_1.normalizeProvidedMessage)(request.message);
        let resolved;
        let validatedInput;
        try {
            resolved = (0, intent_1.resolveIntent)(request);
            const contract = deps.toolRegistry.get(resolved.toolId);
            if (!contract)
                throw errors_1.AssistantError.toolNotFound(resolved.toolId);
            validatedInput = contract.validateInput(resolved.arguments);
        }
        catch (error) {
            const operational = error instanceof errors_1.AssistantError ? error : errors_1.AssistantError.invalidRequest('request cannot be validated');
            const safeMessage = (0, persistence_1.safeRejectedAssistantMessage)(operational.code);
            const turn = await deps.conversations.beginTurn({ userId, conversationId: request.conversationId, correlationId, intent: persistence_1.SAFE_REJECTED_INTENT, locale, content: (0, persistence_1.safeRejectedUserMessage)(), source: 'SAFE_REQUEST_SUMMARY' });
            await deps.conversations.finalizeRejected({ ...turn, content: safeMessage, safeErrorCode: operational.code });
            return { httpStatus: operational.statusCode, response: { status: 'rejected', code: operational.code, message: safeMessage, correlationId, ...turn } };
        }
        const fallback = request.intent === 'transaction.create' ? 'Siapkan draft transaksi untuk konfirmasi.' : (0, persistence_1.monthlySummaryFallback)(validatedInput);
        const turn = await deps.conversations.beginTurn({ userId, conversationId: request.conversationId, correlationId, intent: request.intent, locale, content: provided ?? fallback, source: provided ? 'USER_PROVIDED' : 'CANONICAL_FALLBACK' });
        await deps.conversations.markTurnRunning(turn.turnId);
        const contract = deps.toolRegistry.get(resolved.toolId);
        const policy = (0, policy_1.evaluatePolicy)(contract);
        const redactedInput = request.intent === 'transaction.create' ? { operation: 'transaction.create' } : (0, persistence_1.monthlySummaryInputForAudit)(validatedInput);
        const executionId = await deps.conversations.beginToolExecution({ ...turn, correlationId, toolId: contract.id, capability: contract.capability, riskLevel: contract.riskLevel, policyDecision: policy.action, redactedInput });
        const startedAt = Date.now();
        if (policy.action === 'DRAFT_AND_CONFIRM') {
            return executeTransactionCreate(userId, correlationId, turn, executionId, startedAt, validatedInput);
        }
        return executeAnalytics(userId, correlationId, turn, executionId, startedAt, resolved.toolId, validatedInput);
    }
    // ---- Transaction create with sequential clarification ---------------------
    async function executeTransactionCreate(userId, correlationId, turn, executionId, startedAt, transactionInput) {
        if (!deps.financialDrafts)
            throw new Error('Financial draft service is not configured');
        // Step 1: Resolve wallet
        const hasWalletRef = 'walletReference' in transactionInput;
        let walletData;
        let lastClarificationId;
        if (hasWalletRef) {
            const ref = transactionInput.walletReference;
            const walletResult = await resolveEntity(userId, 'wallet', ref);
            if (walletResult.kind === 'ambiguous') {
                const canonical = buildCanonicalContext(transactionInput);
                const projection = await createEntityClarification({
                    userId, conversationId: turn.conversationId, turnId: turn.turnId,
                    executionId, entityType: 'wallet', trustedContext: canonical,
                    resolution: walletResult,
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
                return { httpStatus: 200, response: { status: 'clarification_required', message, data: { kind: 'provider_text' }, correlationId, ...turn } };
            }
            if (walletResult.kind !== 'resolved') {
                const invalid = errors_1.AssistantError.invalidInput('transaction.create', 'walletReference is invalid');
                const safeMessage = (0, persistence_1.safeRejectedAssistantMessage)(invalid.code);
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
        const explicitMerchantRef = transactionInput.merchantReference;
        const merchantRef = explicitMerchantRef
            ?? (deps.entityResolution ? transactionInput.description : undefined)
            ?? '';
        let merchantData;
        if (merchantRef && deps.entityResolution) {
            const merchantResult = await resolveEntity(userId, 'merchant', merchantRef);
            // Only a merchant the user actually named is worth a question. Ambiguity in
            // a merchant guessed from the description is dropped — the merchant is
            // display metadata, not a reason to interrupt the draft.
            if (merchantResult.kind === 'ambiguous' && explicitMerchantRef) {
                const canonical = buildCanonicalContext(transactionInput, walletData);
                const projection = await createEntityClarification({
                    userId, conversationId: turn.conversationId, turnId: turn.turnId,
                    executionId, entityType: 'merchant', trustedContext: canonical,
                    resolution: merchantResult,
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
                const normalized = merchantResult.normalizedReference ?? merchantRef;
                if (/<[^>]*>/.test(normalized)) {
                    const invalid = errors_1.AssistantError.invalidInput('transaction.create', 'merchantReference contains unsafe content');
                    const safeMsg2 = (0, persistence_1.safeRejectedAssistantMessage)(invalid.code);
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
        const categoryRef = transactionInput.categoryReference;
        let categoryData;
        if (categoryRef) {
            const categoryResult = await resolveEntity(userId, 'category', categoryRef, transactionInput.type);
            if (categoryResult.kind === 'ambiguous') {
                const canonical = buildCanonicalContext(transactionInput, walletData, merchantData);
                const projection = await createEntityClarification({
                    userId, conversationId: turn.conversationId, turnId: turn.turnId,
                    executionId, entityType: 'category', trustedContext: canonical,
                    resolution: categoryResult,
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
            }
            else if (categoryResult.kind !== 'not_found') {
                // Any other kind is an invalid reference — reject before drafting
                const invalid = errors_1.AssistantError.invalidInput('transaction.create', 'categoryReference is invalid');
                const safeMsg = (0, persistence_1.safeRejectedAssistantMessage)(invalid.code);
                await deps.conversations.finalize({
                    executionId, ...turn, status: 'FAILED', turnStatus: 'REJECTED',
                    assistantContent: safeMsg, assistantSource: 'SAFE_ERROR',
                    durationMs: Date.now() - startedAt, safeErrorCode: invalid.code,
                    outputSummary: { operation: 'transaction.create', categoryResolution: categoryResult.kind },
                });
                return { httpStatus: invalid.statusCode, response: { status: 'rejected', code: invalid.code, message: safeMsg, correlationId, ...turn } };
            }
            // not_found: fall through — the draft infers a category from the same hint
        }
        // All resolved — create draft
        return finalizeTransactionDraft(userId, correlationId, turn, executionId, startedAt, transactionInput, walletData, merchantData, categoryData);
    }
    // ---- Finalize transaction draft -------------------------------------------
    async function finalizeTransactionDraft(userId, correlationId, turn, executionId, startedAt, transactionInput, walletData, merchantData, categoryData, transaction) {
        if (!deps.financialDrafts)
            throw new Error('Financial draft service is not configured');
        const walletId = walletData?.internalId ?? transactionInput.walletId;
        // An omitted date is today in the reporting timezone — never a question.
        const transactionDate = transactionInput.date || (0, reportingTime_1.formatReportingDate)(new Date(), config_1.reportingConfig.timezone);
        const providedCategoryId = categoryData?.internalId || transactionInput.categoryId;
        const categoryId = providedCategoryId || await inferCategoryId(userId, transactionInput.type, transactionInput.categoryReference ?? transactionInput.description, transaction);
        if (!categoryId) {
            // Nothing left to infer from: the user owns no matching and no catch-all
            // category, so drafting is impossible. Terminal safe message, not a wizard.
            const message = renderCategoryNotFound();
            await deps.conversations.finalize({
                executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'CLARIFICATION_REQUIRED',
                assistantContent: message, assistantSource: 'DETERMINISTIC_RENDERER',
                durationMs: Date.now() - startedAt,
                outputSummary: { operation: 'transaction.create', categoryResolution: 'not_found' },
            }, { transaction });
            return { httpStatus: 200, response: { status: 'clarification_required', message, data: { kind: 'provider_text' }, correlationId, ...turn } };
        }
        if (!walletId) {
            throw errors_1.AssistantError.invalidInput('transaction.create', 'wallet is required before drafting');
        }
        const draftInput = {
            type: transactionInput.type,
            amount: transactionInput.amount,
            walletId,
            categoryId,
            date: transactionDate,
            ...(transactionInput.description === undefined ? {} : { description: transactionInput.description }),
        };
        try {
            const draft = await deps.financialDrafts.prepare({
                ...draftInput,
                ...(walletData === undefined ? {} : { walletDisplayLabel: walletData.displayLabel }),
                ...(merchantData === undefined ? {} : { merchantDisplayLabel: merchantData.displayLabel }),
                userId,
                ...turn,
                executionId,
                ...(transaction ? { transaction } : {}),
            });
            await deps.conversations.finalize({
                executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'SUCCEEDED',
                assistantContent: draft.renderedText, assistantSource: 'DETERMINISTIC_RENDERER',
                durationMs: Date.now() - startedAt,
                outputSummary: { draftId: draft.draftId, operation: 'transaction.create', status: 'PENDING_CONFIRMATION' },
            }, { transaction });
            return { httpStatus: 200, response: { status: 'success', renderedText: draft.renderedText, data: draft, correlationId, ...turn } };
        }
        catch (error) {
            if (transaction) {
                // Inside the caller's transaction (the select/claim flow): propagate
                // so the whole transaction — including the clarification claim —
                // rolls back. The caller's own catch records the failure once,
                // after rollback, against a fresh connection.
                throw error;
            }
            const operational = error instanceof errors_1.AssistantError ? error : { message: 'Assistant draft preparation failed', statusCode: 500, code: 'ASSISTANT_DRAFT_PREPARATION_FAILED' };
            await deps.conversations.finalize({
                executionId, ...turn, status: 'FAILED', turnStatus: 'FAILED',
                assistantContent: operational.message, assistantSource: 'SAFE_ERROR',
                durationMs: Date.now() - startedAt, safeErrorCode: operational.code,
            }).catch(() => undefined);
            return { httpStatus: operational.statusCode, response: { status: 'error', code: operational.code, message: operational.message, correlationId, ...turn } };
        }
    }
    // ---- Clarification selection (sequential continuation) --------------------
    async function selectClarification(userId, correlationId, token, conversationId, clarificationId) {
        if (!deps.clarification)
            throw new Error('Clarification service is not configured');
        if (!deps.financialDrafts)
            throw new Error('Financial draft service is not configured');
        const clarification = deps.clarification;
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
            // The clarification claim (PENDING -> CONSUMED) and everything it
            // unlocks — child clarification creation or draft creation, and the
            // Assistant lifecycle write that finalizes this turn — commit or roll
            // back together. A failure anywhere in this block leaves the parent
            // clarification PENDING (its token still usable) with no partial
            // child/draft/lifecycle state, so the caller can safely retry.
            return await clarification.runInTransaction(async (tx) => {
                const result = await clarification.select({
                    userId, conversationId, token, correlationId,
                    ...(clarificationId ? { clarificationId } : {}),
                }, { transaction: tx });
                const ctx = result.trustedContext;
                const walletData = result.entityType === 'wallet'
                    ? { internalId: result.selectedCandidateId, displayLabel: result.selectedDisplayLabel }
                    : (ctx.wallet ? { internalId: ctx.wallet.internalId, displayLabel: ctx.wallet.displayLabel } : undefined);
                const merchantData = result.entityType === 'merchant'
                    ? { internalId: result.selectedCandidateId, displayLabel: result.selectedDisplayLabel }
                    : (ctx.merchant ? { internalId: ctx.merchant.internalId, displayLabel: ctx.merchant.displayLabel } : undefined);
                const categoryData = result.entityType === 'category'
                    ? { internalId: result.selectedCandidateId, displayLabel: result.selectedDisplayLabel, categoryType: ctx.type }
                    : undefined;
                const txInput = buildTransactionInput(ctx, walletData);
                const nextEntity = result.entityType === 'wallet' ? 'merchant'
                    : result.entityType === 'merchant' ? 'category'
                        : null;
                // After wallet: try resolving merchant (from merchantReference, or description)
                if (nextEntity === 'merchant') {
                    const ref = ctx.merchantReference ?? ctx.description ?? '';
                    if (ref) {
                        const mr = await resolveEntity(userId, 'merchant', ref, undefined, tx);
                        // Same rule as the first turn: only a user-named merchant may clarify.
                        if (mr.kind === 'ambiguous' && ctx.merchantReference) {
                            const projection = await createEntityClarification({
                                userId, conversationId, turnId: turn.turnId,
                                executionId, entityType: 'merchant',
                                trustedContext: buildCanonicalContext(txInput, walletData),
                                resolution: mr,
                                parentClarificationId: result.clarificationId,
                                transaction: tx,
                            });
                            await deps.conversations.finalize({
                                executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'CLARIFICATION_REQUIRED',
                                assistantContent: projection.prompt, assistantSource: 'DETERMINISTIC_RENDERER',
                                durationMs: Date.now() - startedAt,
                                outputSummary: { operation: 'transaction.create', merchantResolution: 'ambiguous', clarificationId: projection.clarificationId },
                            }, { transaction: tx });
                            return clarificationResponse(turn, executionId, correlationId, startedAt, projection, 'merchant');
                        }
                        // resolved or not_found: continue to category
                        if (mr.kind === 'resolved') {
                            return continueToCategory(userId, correlationId, turn, executionId, startedAt, txInput, walletData, { internalId: mr.entity.internalId, displayLabel: mr.displayLabel }, undefined, tx);
                        }
                        // not_found: free-form merchant, continue to category
                        return continueToCategory(userId, correlationId, turn, executionId, startedAt, txInput, walletData, undefined, undefined, tx);
                    }
                    // no merchant reference: skip to category
                    return continueToCategory(userId, correlationId, turn, executionId, startedAt, txInput, walletData, undefined, undefined, tx);
                }
                // After merchant: resolve category
                if (nextEntity === 'category') {
                    return continueToCategory(userId, correlationId, turn, executionId, startedAt, txInput, walletData, merchantData, result.clarificationId, tx);
                }
                // After category or no more entities: create draft
                return finalizeTransactionDraft(userId, correlationId, turn, executionId, startedAt, txInput, walletData, merchantData, categoryData, tx);
            });
        }
        catch (error) {
            const operational = error instanceof errors_1.AssistantError ? error : { message: 'Clarification selection failed', statusCode: 500, code: 'ASSISTANT_CLARIFICATION_FAILED' };
            await deps.conversations.finalize({
                executionId, ...turn, status: 'FAILED', turnStatus: 'FAILED',
                assistantContent: operational.message, assistantSource: 'SAFE_ERROR',
                durationMs: Date.now() - startedAt, safeErrorCode: operational.code,
            }).catch(() => undefined);
            return { httpStatus: operational.statusCode, response: { status: 'error', code: operational.code, message: operational.message, correlationId, ...turn } };
        }
    }
    async function submitGuidedClarification(userId, correlationId, fields, conversationId, clarificationId) {
        if (!deps.clarification)
            throw new Error('Clarification service is not configured');
        if (!deps.financialDrafts)
            throw new Error('Financial draft service is not configured');
        const clarification = deps.clarification;
        const startedAt = Date.now();
        const locale = 'id-ID';
        const turn = await deps.conversations.beginTurn({
            userId, conversationId, correlationId,
            intent: 'clarification.guided_submit',
            locale,
            content: 'Lengkapi klarifikasi transaksi.',
            source: 'USER_PROVIDED',
        });
        await deps.conversations.markTurnRunning(turn.turnId);
        const executionId = await deps.conversations.beginToolExecution({
            ...turn, correlationId, toolId: 'clarification.guided_submit',
            capability: 'transaction.create', riskLevel: 'HIGH',
            policyDecision: 'EXPLICIT',
            redactedInput: { operation: 'clarification.guided_submit' },
        });
        try {
            const submittedDate = fields.date;
            if (submittedDate !== undefined && (typeof submittedDate !== 'string' || !isCalendarDay(submittedDate))) {
                throw errors_1.AssistantError.invalidInput('clarification.guided_submit', 'date must be a valid YYYY-MM-DD day');
            }
            return await clarification.runInTransaction(async (tx) => {
                const result = await clarification.consumeGuidedFields({
                    userId, conversationId, clarificationId, correlationId,
                }, { transaction: tx });
                const ctx = result.trustedContext;
                const walletData = ctx.wallet ? { internalId: ctx.wallet.internalId, displayLabel: ctx.wallet.displayLabel } : undefined;
                const merchantData = ctx.merchant ? { internalId: ctx.merchant.internalId, displayLabel: ctx.merchant.displayLabel } : undefined;
                const categoryData = ctx.category ? { internalId: ctx.category.internalId, displayLabel: ctx.category.displayLabel, categoryType: ctx.type } : undefined;
                const date = ctx.date ?? submittedDate;
                if (typeof date !== 'string' || !isCalendarDay(date)) {
                    throw errors_1.AssistantError.invalidInput('clarification.guided_submit', 'date must be a valid YYYY-MM-DD day');
                }
                const submittedCategory = typeof fields.categoryReference === 'string'
                    ? fields.categoryReference.trim()
                    : typeof fields.category === 'string'
                        ? fields.category.trim()
                        : undefined;
                const txInput = {
                    type: ctx.type,
                    amount: ctx.amount,
                    date,
                    ...(ctx.description ? { description: ctx.description } : {}),
                    ...(ctx.merchantReference ? { merchantReference: ctx.merchantReference } : {}),
                    ...(ctx.categoryReference ? { categoryReference: ctx.categoryReference } : submittedCategory ? { categoryReference: submittedCategory } : {}),
                    ...(walletData ? { walletId: walletData.internalId } : { walletReference: '' }),
                    categoryId: categoryData?.internalId ?? '',
                };
                return continueToCategory(userId, correlationId, turn, executionId, startedAt, txInput, walletData, merchantData, result.clarificationId, tx);
            });
        }
        catch (error) {
            const operational = error instanceof errors_1.AssistantError ? error : { message: 'Guided clarification submission failed', statusCode: 500, code: 'ASSISTANT_CLARIFICATION_FAILED' };
            await deps.conversations.finalize({
                executionId, ...turn, status: 'FAILED', turnStatus: 'FAILED',
                assistantContent: operational.message, assistantSource: 'SAFE_ERROR',
                durationMs: Date.now() - startedAt, safeErrorCode: operational.code,
            }).catch(() => undefined);
            return { httpStatus: operational.statusCode, response: { status: 'error', code: operational.code, message: operational.message, correlationId, ...turn } };
        }
    }
    // ---- Continue to category after merchant resolution -----------------------
    async function continueToCategory(userId, correlationId, turn, executionId, startedAt, txInput, walletData, merchantData, parentClarificationId, transaction) {
        // Only resolve category if categoryReference is explicitly provided.
        // Otherwise, use the direct categoryId from the input context.
        const categoryRef = txInput.categoryReference;
        if (categoryRef) {
            const cr = await resolveEntity(userId, 'category', categoryRef, txInput.type, transaction);
            if (cr.kind === 'ambiguous') {
                const projection = await createEntityClarification({
                    userId, conversationId: turn.conversationId, turnId: turn.turnId,
                    executionId, entityType: 'category',
                    trustedContext: buildCanonicalContext(txInput, walletData, merchantData),
                    resolution: cr,
                    parentClarificationId,
                    transaction,
                });
                await deps.conversations.finalize({
                    executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'CLARIFICATION_REQUIRED',
                    assistantContent: projection.prompt, assistantSource: 'DETERMINISTIC_RENDERER',
                    durationMs: Date.now() - startedAt,
                    outputSummary: { operation: 'transaction.create', categoryResolution: 'ambiguous', clarificationId: projection.clarificationId },
                }, { transaction });
                return clarificationResponse(turn, executionId, correlationId, startedAt, projection, 'category');
            }
            if (cr.kind === 'resolved') {
                return finalizeTransactionDraft(userId, correlationId, turn, executionId, startedAt, txInput, walletData, merchantData, { internalId: cr.entity.internalId, displayLabel: cr.displayLabel, categoryType: txInput.type }, transaction);
            }
            // not_found: fall through — the draft infers a category from the same hint
        }
        // No category reference: use direct categoryId from input → draft
        return finalizeTransactionDraft(userId, correlationId, turn, executionId, startedAt, txInput, walletData, merchantData, undefined, transaction);
    }
    // ---- Helper: reconstruct TransactionCreateToolInput from context ----------
    function buildTransactionInput(ctx, walletData) {
        const base = {
            type: ctx.type,
            amount: ctx.amount,
            date: ctx.date,
            ...(ctx.description ? { description: ctx.description } : {}),
            ...(ctx.merchantReference ? { merchantReference: ctx.merchantReference } : {}),
            ...(ctx.categoryReference ? { categoryReference: ctx.categoryReference } : {}),
        };
        if (walletData) {
            return { ...base, walletId: walletData.internalId, categoryId: ctx.category?.internalId ?? '' };
        }
        return {
            ...base,
            walletReference: '',
            categoryId: ctx.category?.internalId ?? '',
        };
    }
    // ---- Cancel clarification -------------------------------------------------
    async function cancelClarification(userId, correlationId, clarificationId, conversationId) {
        if (!deps.clarification)
            throw new Error('Clarification service is not configured');
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
            await deps.clarification.cancel({ userId, clarificationId, conversationId, reason: 'user_cancelled' });
            const message = 'Klarifikasi dibatalkan. Silakan mulai ulang pembuatan transaksi.';
            await deps.conversations.finalizeWithoutTool({
                ...turn,
                turnStatus: 'SUCCEEDED',
                assistantContent: message,
                assistantSource: 'DETERMINISTIC_RENDERER',
            });
            return { httpStatus: 200, response: { status: 'success', renderedText: message, data: { clarificationId, status: 'CANCELLED' }, correlationId, ...turn } };
        }
        catch (error) {
            const operational = error instanceof errors_1.AssistantError ? error : { message: 'Clarification cancellation failed', statusCode: 500, code: 'ASSISTANT_CLARIFICATION_FAILED' };
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
    async function getAssistantState(userId, conversationId) {
        if (!deps.clarification)
            return {};
        return deps.clarification.getAssistantState(userId, conversationId);
    }
    // ---- Analytics flow (unchanged) -------------------------------------------
    async function executeAnalytics(userId, correlationId, turn, executionId, startedAt, toolId, validatedInput) {
        let result;
        try {
            result = await (0, executor_1.executeTool)(toolId, validatedInput, { userId, correlationId, ...turn, timestamp: new Date() }, deps.toolRegistry, deps.handlerRegistry);
        }
        catch (error) {
            const operational = error instanceof errors_1.AssistantError ? error : { message: 'Assistant execution failed', statusCode: 500, code: 'ASSISTANT_EXECUTION_FAILED' };
            const status = operational.code === 'ASSISTANT_EXECUTION_TIMEOUT' ? 'TIMED_OUT'
                : operational.code === 'ASSISTANT_POLICY_DENIED' || operational.code === 'ASSISTANT_TOOL_DISABLED' ? 'DENIED'
                    : 'FAILED';
            await deps.conversations.finalize({ executionId, ...turn, status, turnStatus: 'FAILED', assistantContent: operational.message, assistantSource: 'SAFE_ERROR', durationMs: Date.now() - startedAt, safeErrorCode: operational.code }).catch(() => undefined);
            return { httpStatus: operational.statusCode, response: { status: 'error', code: operational.code, message: operational.message, correlationId, ...turn } };
        }
        const renderedText = (0, persistence_1.assertAssistantMessageLength)((0, renderer_1.renderMonthlySpendingSummary)(result.output));
        try {
            await deps.conversations.finalize({ executionId, ...turn, status: 'SUCCEEDED', turnStatus: 'SUCCEEDED', assistantContent: renderedText, assistantSource: 'DETERMINISTIC_RENDERER', durationMs: result.durationMs, outputSummary: (0, persistence_1.monthlySummaryOutputForAudit)(result.output) });
        }
        catch (error) {
            logger_1.logger.error('assistant_finalization_failed', { correlationId, conversationId: turn.conversationId, turnId: turn.turnId });
            throw error;
        }
        return { httpStatus: 200, response: { status: 'success', renderedText, data: result.output, correlationId, ...turn } };
    }
    return { execute, prepareProviderExecution, selectClarification, submitGuidedClarification, cancelClarification, getAssistantState };
}
// ---- Render helpers ----------------------------------------------------------
function renderEntityClarificationPrompt(entityType, resolution) {
    const label = entityType === 'wallet' ? 'Wallet' : entityType === 'merchant' ? 'Pedagang' : 'Kategori';
    const options = resolution.options
        .map((opt) => opt.discriminator
        ? `${opt.displayLabel} (${opt.discriminator})`
        : opt.displayLabel)
        .join(', ');
    return `${label} yang dimaksud belum jelas. Pilih salah satu: ${options}.`;
}
function renderWalletNotFound(resolution) {
    return 'Wallet tersebut tidak ditemukan atau tidak dapat digunakan. Sebutkan nama wallet aktif yang lain.';
}
function renderCategoryNotFound() {
    return 'Kategori tidak ditemukan. Silakan mulai ulang pembuatan transaksi dengan kategori yang valid.';
}
function isCalendarDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
//# sourceMappingURL=application.service.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAssistantFinancialDraftService = createAssistantFinancialDraftService;
const client_1 = require("../generated/prisma/client");
const config_1 = require("../config");
const reportingTime_1 = require("../domain/reportingTime");
const transaction_errors_1 = require("../services/transaction.errors");
const errors_1 = require("./errors");
const financial_draft_1 = require("./financial-draft");
const CONFIRM_INTENT = 'transaction.create.confirm';
const CANCEL_INTENT = 'transaction.create.cancel';
function preview(input, categoryName) {
    return {
        type: input.type,
        amount: input.amount,
        ...(input.walletDisplayLabel === undefined
            ? { walletId: input.walletId }
            : { wallet: input.walletDisplayLabel }),
        category: categoryName,
        ...(input.merchantDisplayLabel === undefined
            ? {}
            : { merchant: input.merchantDisplayLabel }),
        date: input.date,
        ...(input.description === undefined ? {} : { description: input.description }),
    };
}
function createAssistantFinancialDraftService(db, transactions, clock = () => new Date()) {
    async function prepare(input) {
        const client = input.transaction ?? db;
        const wallet = await client.wallet.findFirst({ where: { id: input.walletId, userId: input.userId }, select: { id: true } });
        const category = await client.category.findFirst({
            where: { id: input.categoryId, userId: input.userId, type: input.type },
            select: { id: true, name: true },
        });
        if (!wallet || !category)
            throw errors_1.AssistantError.draftNotFound();
        const now = input.now ?? new Date();
        const row = await client.assistantFinancialDraft.create({ data: {
                userId: input.userId, conversationId: input.conversationId, originatingTurnId: input.turnId,
                originatingExecutionId: input.executionId, operation: 'transaction.create', transactionType: input.type,
                amount: new client_1.Prisma.Decimal(input.amount), walletId: input.walletId, categoryId: input.categoryId,
                transactionDate: (0, reportingTime_1.parseBusinessDate)(input.date, config_1.reportingConfig.timezone), description: input.description ?? null,
                expiresAt: new Date(now.getTime() + financial_draft_1.ASSISTANT_FINANCIAL_DRAFT_TTL_MS),
            } });
        return {
            draftId: row.id,
            status: row.status,
            expiresAt: row.expiresAt,
            preview: preview(input, category.name),
            confirmationRequired: true,
            renderedText: (0, financial_draft_1.renderTransactionDraftPreview)(input, input.walletDisplayLabel, category.name, input.merchantDisplayLabel),
        };
    }
    async function confirm(userId, draftId, keyValue, correlationId) {
        const key = (0, financial_draft_1.validateIdempotencyKey)(keyValue);
        try {
            const result = await db.$transaction(async (tx) => {
                await tx.$queryRaw(client_1.Prisma.sql `SELECT pg_advisory_xact_lock(hashtextextended(${draftId}, 0))::text AS "lock"`);
                const existingKey = await tx.assistantIdempotencyRecord.findUnique({ where: { userId_key: { userId, key } } });
                if (existingKey && existingKey.draftId !== draftId)
                    throw errors_1.AssistantError.idempotencyConflict();
                let draft = await tx.assistantFinancialDraft.findFirst({ where: { id: draftId, userId } });
                if (!draft)
                    throw errors_1.AssistantError.draftNotFound();
                if (draft.status === 'COMMITTED' && draft.transactionId)
                    return committedResult(draft);
                const now = clock();
                if (draft.status === 'PENDING_CONFIRMATION' && draft.expiresAt <= now) {
                    draft = await tx.assistantFinancialDraft.update({ where: { id: draft.id }, data: { status: 'EXPIRED' } });
                    return { error: errors_1.AssistantError.draftConflict('EXPIRED') };
                }
                if (draft.status !== 'PENDING_CONFIRMATION')
                    throw errors_1.AssistantError.draftConflict(draft.status);
                const turn = await tx.assistantTurn.create({ data: { conversationId: draft.conversationId, correlationId, intent: CONFIRM_INTENT, locale: 'id-ID', status: 'RUNNING' } });
                await tx.assistantMessage.create({ data: { conversationId: draft.conversationId, turnId: turn.id, role: 'USER', source: 'CANONICAL_FALLBACK', content: `Konfirmasi draft transaksi ${draft.id}.` } });
                const execution = await tx.assistantToolExecution.create({ data: { conversationId: draft.conversationId, turnId: turn.id, toolId: CONFIRM_INTENT, capability: 'transaction.create', riskLevel: 'HIGH', policyDecision: 'EXPLICITLY_CONFIRMED', status: 'RUNNING', correlationId, idempotencyKey: key, redactedInput: { draftId: draft.id } } });
                if (!existingKey)
                    await tx.assistantIdempotencyRecord.create({ data: { userId, draftId, operation: CONFIRM_INTENT, key } });
                const created = await transactions.createTransaction({ userId, type: draft.transactionType, amount: draft.amount, walletId: draft.walletId, categoryId: draft.categoryId, date: draft.transactionDate.toISOString(), description: draft.description ?? undefined }, { transaction: tx });
                const claimed = await tx.assistantFinancialDraft.updateMany({ where: { id: draft.id, userId, status: 'PENDING_CONFIRMATION', transactionId: null }, data: { status: 'COMMITTED', committedAt: now, transactionId: created.id } });
                if (claimed.count !== 1)
                    throw errors_1.AssistantError.draftConflict('TERMINAL');
                await tx.assistantIdempotencyRecord.update({ where: { userId_key: { userId, key } }, data: { transactionId: created.id } });
                const content = `Draft ${draft.id} dikonfirmasi. Transaksi ${created.id} berhasil dibuat.`;
                await tx.assistantMessage.create({ data: { conversationId: draft.conversationId, turnId: turn.id, role: 'ASSISTANT', source: 'DETERMINISTIC_RENDERER', content } });
                await tx.assistantToolExecution.update({ where: { id: execution.id }, data: { status: 'SUCCEEDED', completedAt: now, outputSummary: { draftId: draft.id, transactionId: created.id, status: 'COMMITTED' } } });
                await tx.assistantTurn.update({ where: { id: turn.id }, data: { status: 'SUCCEEDED', finishedAt: now } });
                await tx.assistantConversation.update({ where: { id: draft.conversationId }, data: { lastActivityAt: now } });
                return { draftId: draft.id, status: 'COMMITTED', transactionId: created.id, conversationId: draft.conversationId, turnId: turn.id, renderedText: content };
            });
            if ('error' in result)
                throw result.error;
            return result;
        }
        catch (error) {
            if (error instanceof errors_1.AssistantError)
                throw error;
            if (error.code === 'P2002') {
                const existingKey = await db.assistantIdempotencyRecord.findUnique({ where: { userId_key: { userId, key } }, select: { draftId: true } });
                if (existingKey && existingKey.draftId !== draftId)
                    throw errors_1.AssistantError.idempotencyConflict();
            }
            if (error instanceof transaction_errors_1.TransactionError) {
                await db.$transaction(async (tx) => {
                    const draft = await tx.assistantFinancialDraft.findFirst({ where: { id: draftId, userId, status: 'PENDING_CONFIRMATION' } });
                    if (!draft)
                        return;
                    const now = new Date();
                    const turn = await tx.assistantTurn.create({ data: { conversationId: draft.conversationId, correlationId, intent: CONFIRM_INTENT, locale: 'id-ID', status: 'FAILED', safeErrorCode: error.code, finishedAt: now } });
                    await tx.assistantMessage.createMany({ data: [
                            { conversationId: draft.conversationId, turnId: turn.id, role: 'USER', source: 'CANONICAL_FALLBACK', content: `Konfirmasi draft transaksi ${draft.id}.` },
                            { conversationId: draft.conversationId, turnId: turn.id, role: 'ASSISTANT', source: 'SAFE_ERROR', content: 'Draft transaksi tidak dapat dikomit.' },
                        ] });
                    await tx.assistantToolExecution.create({ data: { conversationId: draft.conversationId, turnId: turn.id, toolId: CONFIRM_INTENT, capability: 'transaction.create', riskLevel: 'HIGH', policyDecision: 'EXPLICITLY_CONFIRMED', status: 'FAILED', correlationId, completedAt: now, safeErrorCode: error.code, idempotencyKey: key, redactedInput: { draftId }, outputSummary: { draftId, status: 'FAILED' } } });
                    await tx.assistantFinancialDraft.update({ where: { id: draft.id }, data: { status: 'FAILED', failedAt: now } });
                    await tx.assistantConversation.update({ where: { id: draft.conversationId }, data: { lastActivityAt: now } });
                });
                throw error;
            }
            throw error;
        }
    }
    async function cancel(userId, draftId, correlationId) {
        return db.$transaction(async (tx) => {
            await tx.$queryRaw(client_1.Prisma.sql `SELECT pg_advisory_xact_lock(hashtextextended(${draftId}, 0))::text AS "lock"`);
            let draft = await tx.assistantFinancialDraft.findFirst({ where: { id: draftId, userId } });
            if (!draft)
                throw errors_1.AssistantError.draftNotFound();
            if (draft.status === 'CANCELLED')
                return cancelledResult(draft);
            const now = clock();
            if (draft.status === 'PENDING_CONFIRMATION' && draft.expiresAt <= now) {
                draft = await tx.assistantFinancialDraft.update({ where: { id: draft.id }, data: { status: 'EXPIRED' } });
                return { draftId: draft.id, status: 'EXPIRED', conversationId: draft.conversationId };
            }
            if (draft.status !== 'PENDING_CONFIRMATION')
                throw errors_1.AssistantError.draftConflict(draft.status);
            const turn = await tx.assistantTurn.create({ data: { conversationId: draft.conversationId, correlationId, intent: CANCEL_INTENT, locale: 'id-ID', status: 'SUCCEEDED', finishedAt: now } });
            await tx.assistantMessage.createMany({ data: [
                    { conversationId: draft.conversationId, turnId: turn.id, role: 'USER', source: 'CANONICAL_FALLBACK', content: `Batalkan draft transaksi ${draft.id}.` },
                    { conversationId: draft.conversationId, turnId: turn.id, role: 'ASSISTANT', source: 'DETERMINISTIC_RENDERER', content: `Draft transaksi ${draft.id} dibatalkan.` },
                ] });
            await tx.assistantToolExecution.create({ data: { conversationId: draft.conversationId, turnId: turn.id, toolId: CANCEL_INTENT, capability: 'transaction.create', riskLevel: 'HIGH', policyDecision: 'CANCEL', status: 'SUCCEEDED', correlationId, completedAt: now, redactedInput: { draftId: draft.id }, outputSummary: { draftId: draft.id, status: 'CANCELLED' } } });
            draft = await tx.assistantFinancialDraft.update({ where: { id: draft.id }, data: { status: 'CANCELLED', cancelledAt: now } });
            await tx.assistantConversation.update({ where: { id: draft.conversationId }, data: { lastActivityAt: now } });
            return cancelledResult(draft, turn.id);
        });
    }
    return { prepare, confirm, cancel };
}
function committedResult(draft) {
    return { draftId: draft.id, status: 'COMMITTED', transactionId: draft.transactionId, conversationId: draft.conversationId, renderedText: `Draft ${draft.id} sudah dikonfirmasi. Transaksi ${draft.transactionId} telah dibuat.` };
}
function cancelledResult(draft, turnId) {
    return { draftId: draft.id, status: 'CANCELLED', conversationId: draft.conversationId, ...(turnId ? { turnId } : {}), renderedText: `Draft transaksi ${draft.id} dibatalkan.` };
}
//# sourceMappingURL=financial-draft.service.js.map
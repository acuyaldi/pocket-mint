import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { reportingConfig } from '../config';
import { parseBusinessDate } from '../domain/reportingTime';
import { TransactionError } from '../services/transaction.errors';
import type { TransactionService } from '../services/transaction.service';
import { AssistantError } from './errors';
import { ASSISTANT_FINANCIAL_DRAFT_TTL_MS, renderTransactionDraftPreview, validateIdempotencyKey } from './financial-draft';
import type { TransactionCreateInput } from './tools';

const CONFIRM_INTENT = 'transaction.create.confirm';
const CANCEL_INTENT = 'transaction.create.cancel';

function preview(input: TransactionCreateInput & {
  walletDisplayLabel?: string;
  merchantDisplayLabel?: string;
}, categoryName: string) {
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

export function createAssistantFinancialDraftService(db: PrismaClient, transactions: TransactionService, clock: () => Date = () => new Date()) {
  async function prepare(input: TransactionCreateInput & { walletDisplayLabel?: string; merchantDisplayLabel?: string; userId: string; conversationId: string; turnId: string; executionId: string; now?: Date; transaction?: Prisma.TransactionClient }) {
    const client = input.transaction ?? db;
    const wallet = await client.wallet.findFirst({ where: { id: input.walletId, userId: input.userId }, select: { id: true } });
    const category = await client.category.findFirst({
      where: { id: input.categoryId, userId: input.userId, type: input.type },
      select: { id: true, name: true },
    });
    if (!wallet || !category) throw AssistantError.draftNotFound();
    const now = input.now ?? new Date();
    const row = await client.assistantFinancialDraft.create({ data: {
      userId: input.userId, conversationId: input.conversationId, originatingTurnId: input.turnId,
      originatingExecutionId: input.executionId, operation: 'transaction.create', transactionType: input.type,
      amount: new Prisma.Decimal(input.amount), walletId: input.walletId, categoryId: input.categoryId,
      transactionDate: parseBusinessDate(input.date, reportingConfig.timezone), description: input.description ?? null,
      expiresAt: new Date(now.getTime() + ASSISTANT_FINANCIAL_DRAFT_TTL_MS),
    }});
    return {
      draftId: row.id,
      status: row.status,
      expiresAt: row.expiresAt,
      preview: preview(input, category.name),
      confirmationRequired: true,
      renderedText: renderTransactionDraftPreview(
        input,
        input.walletDisplayLabel,
        category.name,
        input.merchantDisplayLabel,
      ),
    };
  }

  async function confirm(userId: string, draftId: string, keyValue: unknown, correlationId: string) {
    const key = validateIdempotencyKey(keyValue);
    try {
      const result = await db.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${draftId}, 0))::text AS "lock"`);
        const existingKey = await tx.assistantIdempotencyRecord.findUnique({ where: { userId_key: { userId, key } } });
        if (existingKey && existingKey.draftId !== draftId) throw AssistantError.idempotencyConflict();
        let draft = await tx.assistantFinancialDraft.findFirst({ where: { id: draftId, userId } });
        if (!draft) throw AssistantError.draftNotFound();
        if (draft.status === 'COMMITTED' && draft.transactionId) return committedResult(draft);
        const now = clock();
        if (draft.status === 'PENDING_CONFIRMATION' && draft.expiresAt <= now) {
          draft = await tx.assistantFinancialDraft.update({ where: { id: draft.id }, data: { status: 'EXPIRED' } });
          return { error: AssistantError.draftConflict('EXPIRED') } as const;
        }
        if (draft.status !== 'PENDING_CONFIRMATION') throw AssistantError.draftConflict(draft.status);

        const turn = await tx.assistantTurn.create({ data: { conversationId: draft.conversationId, correlationId, intent: CONFIRM_INTENT, locale: 'id-ID', status: 'RUNNING' } });
        await tx.assistantMessage.create({ data: { conversationId: draft.conversationId, turnId: turn.id, role: 'USER', source: 'CANONICAL_FALLBACK', content: `Konfirmasi draft transaksi ${draft.id}.` } });
        const execution = await tx.assistantToolExecution.create({ data: { conversationId: draft.conversationId, turnId: turn.id, toolId: CONFIRM_INTENT, capability: 'transaction.create', riskLevel: 'HIGH', policyDecision: 'EXPLICITLY_CONFIRMED', status: 'RUNNING', correlationId, idempotencyKey: key, redactedInput: { draftId: draft.id } } });
        if (!existingKey) await tx.assistantIdempotencyRecord.create({ data: { userId, draftId, operation: CONFIRM_INTENT, key } });

        const created = await transactions.createTransaction({ userId, type: draft.transactionType, amount: draft.amount, walletId: draft.walletId, categoryId: draft.categoryId, date: draft.transactionDate.toISOString(), description: draft.description ?? undefined }, { transaction: tx });
        const claimed = await tx.assistantFinancialDraft.updateMany({ where: { id: draft.id, userId, status: 'PENDING_CONFIRMATION', transactionId: null }, data: { status: 'COMMITTED', committedAt: now, transactionId: created.id } });
        if (claimed.count !== 1) throw AssistantError.draftConflict('TERMINAL');
        await tx.assistantIdempotencyRecord.update({ where: { userId_key: { userId, key } }, data: { transactionId: created.id } });
        const content = `Draft ${draft.id} dikonfirmasi. Transaksi ${created.id} berhasil dibuat.`;
        await tx.assistantMessage.create({ data: { conversationId: draft.conversationId, turnId: turn.id, role: 'ASSISTANT', source: 'DETERMINISTIC_RENDERER', content } });
        await tx.assistantToolExecution.update({ where: { id: execution.id }, data: { status: 'SUCCEEDED', completedAt: now, outputSummary: { draftId: draft.id, transactionId: created.id, status: 'COMMITTED' } } });
        await tx.assistantTurn.update({ where: { id: turn.id }, data: { status: 'SUCCEEDED', finishedAt: now } });
        await tx.assistantConversation.update({ where: { id: draft.conversationId }, data: { lastActivityAt: now } });
        return { draftId: draft.id, status: 'COMMITTED' as const, transactionId: created.id, conversationId: draft.conversationId, turnId: turn.id, renderedText: content };
      });
      if ('error' in result) throw result.error;
      return result;
    } catch (error) {
      if (error instanceof AssistantError) throw error;
      if ((error as { code?: string }).code === 'P2002') {
        const existingKey = await db.assistantIdempotencyRecord.findUnique({ where: { userId_key: { userId, key } }, select: { draftId: true } });
        if (existingKey && existingKey.draftId !== draftId) throw AssistantError.idempotencyConflict();
      }
      if (error instanceof TransactionError) {
        await db.$transaction(async (tx) => {
          const draft = await tx.assistantFinancialDraft.findFirst({ where: { id: draftId, userId, status: 'PENDING_CONFIRMATION' } });
          if (!draft) return;
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

  async function cancel(userId: string, draftId: string, correlationId: string) {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${draftId}, 0))::text AS "lock"`);
      let draft = await tx.assistantFinancialDraft.findFirst({ where: { id: draftId, userId } });
      if (!draft) throw AssistantError.draftNotFound();
      if (draft.status === 'CANCELLED') return cancelledResult(draft);
      const now = clock();
      if (draft.status === 'PENDING_CONFIRMATION' && draft.expiresAt <= now) {
        draft = await tx.assistantFinancialDraft.update({ where: { id: draft.id }, data: { status: 'EXPIRED' } });
        return { draftId: draft.id, status: 'EXPIRED' as const, conversationId: draft.conversationId };
      }
      if (draft.status !== 'PENDING_CONFIRMATION') throw AssistantError.draftConflict(draft.status);
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

function committedResult(draft: { id: string; transactionId: string | null; conversationId: string }) {
  return { draftId: draft.id, status: 'COMMITTED' as const, transactionId: draft.transactionId!, conversationId: draft.conversationId, renderedText: `Draft ${draft.id} sudah dikonfirmasi. Transaksi ${draft.transactionId} telah dibuat.` };
}
function cancelledResult(draft: { id: string; conversationId: string }, turnId?: string) {
  return { draftId: draft.id, status: 'CANCELLED' as const, conversationId: draft.conversationId, ...(turnId ? { turnId } : {}), renderedText: `Draft transaksi ${draft.id} dibatalkan.` };
}

export type AssistantFinancialDraftService = ReturnType<typeof createAssistantFinancialDraftService>;

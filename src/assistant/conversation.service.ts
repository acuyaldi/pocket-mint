import type { PrismaClient, Prisma } from '../generated/prisma/client';
import { AssistantError } from './errors';
import { assertAssistantMessageLength } from './persistence';
import type { BeginTurnInput, BeginTurnResult, ConversationMessageDto, ConversationSummaryDto, FinalizeToolInput, FinalizeWithoutToolInput, Page } from './conversation.types';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const pageArgs = (page?: number, limit?: number) => {
  const p = Number.isInteger(page) && page! > 0 ? page! : 1;
  const l = Number.isInteger(limit) && limit! > 0 ? Math.min(limit!, MAX_LIMIT) : DEFAULT_LIMIT;
  return { page: p, limit: l, skip: (p - 1) * l };
};

export function createAssistantConversationService(db: PrismaClient) {
  async function owned(userId: string, id: string) {
    const conversation = await db.assistantConversation.findFirst({ where: { id, userId } });
    if (!conversation) throw AssistantError.conversationNotFound();
    return conversation;
  }

  async function assertContinuable(userId: string, id: string): Promise<void> {
    const conversation = await owned(userId, id);
    if (conversation.status !== 'ACTIVE') throw AssistantError.conversationNotContinuable();
  }

  async function establishConversation(userId: string, conversationId: string | undefined, locale: string): Promise<string> {
    if (conversationId) {
      await assertContinuable(userId, conversationId);
      return conversationId;
    }
    const created = await db.assistantConversation.create({ data: { userId, locale } });
    return created.id;
  }

  async function beginTurn(input: BeginTurnInput): Promise<BeginTurnResult> {
    assertAssistantMessageLength(input.content);
    return db.$transaction(async (tx) => {
      let conversationId = input.conversationId;
      if (conversationId) {
        const conversation = await tx.assistantConversation.findFirst({ where: { id: conversationId, userId: input.userId } });
        if (!conversation) throw AssistantError.conversationNotFound();
        if (conversation.status !== 'ACTIVE') throw AssistantError.conversationNotContinuable();
      } else {
        const created = await tx.assistantConversation.create({ data: { userId: input.userId, locale: input.locale } });
        conversationId = created.id;
      }
      const now = new Date();
      const turn = await tx.assistantTurn.create({ data: {
        conversationId, correlationId: input.correlationId, intent: input.intent.slice(0, 255), locale: input.locale,
      }});
      await tx.assistantMessage.create({ data: {
        conversationId, turnId: turn.id, role: 'USER', source: input.source, content: input.content,
      }});
      await tx.assistantConversation.update({ where: { id: conversationId }, data: { lastActivityAt: now, locale: input.locale } });
      return { conversationId, turnId: turn.id };
    });
  }

  async function markTurnRunning(turnId: string): Promise<void> {
    await db.assistantTurn.update({ where: { id: turnId }, data: { status: 'RUNNING' } });
  }

  async function beginToolExecution(input: {
    conversationId: string; turnId: string; correlationId: string; toolId: string; capability: string;
    riskLevel: string; policyDecision: string; redactedInput?: Prisma.InputJsonValue;
  }): Promise<string> {
    const row = await db.assistantToolExecution.create({ data: { ...input, status: 'RUNNING' } });
    return row.id;
  }

  async function finalize(input: FinalizeToolInput, options: { transaction?: Prisma.TransactionClient } = {}): Promise<void> {
    assertAssistantMessageLength(input.assistantContent);
    const work = async (tx: Prisma.TransactionClient) => {
      const now = new Date();
      await tx.assistantToolExecution.update({ where: { id: input.executionId }, data: {
        status: input.status, completedAt: now, durationMs: input.durationMs, safeErrorCode: input.safeErrorCode,
        outputSummary: input.outputSummary,
      }});
      // Skip the ASSISTANT message when content is empty — the Transaction Review
      // workspace replaces chat bubbles for draft creation (Phase 2). All other
      // callers pass non-empty content and are unaffected.
      if (input.assistantContent.length > 0) {
        await tx.assistantMessage.create({ data: {
          conversationId: input.conversationId, turnId: input.turnId, role: 'ASSISTANT',
          source: input.assistantSource, content: input.assistantContent,
        }});
      }
      await tx.assistantTurn.update({ where: { id: input.turnId }, data: {
        status: input.turnStatus, safeErrorCode: input.safeErrorCode, finishedAt: now,
      }});
      await tx.assistantConversation.update({ where: { id: input.conversationId }, data: { lastActivityAt: now } });
    };
    if (options.transaction) await work(options.transaction);
    else await db.$transaction(work);
  }

  async function finalizeRejected(input: BeginTurnResult & { content: string; safeErrorCode: string }): Promise<void> {
    assertAssistantMessageLength(input.content);
    await db.$transaction(async (tx) => {
      const now = new Date();
      await tx.assistantMessage.create({ data: { conversationId: input.conversationId, turnId: input.turnId, role: 'ASSISTANT', source: 'SAFE_ERROR', content: input.content } });
      await tx.assistantTurn.update({ where: { id: input.turnId }, data: { status: 'REJECTED', safeErrorCode: input.safeErrorCode, finishedAt: now } });
      await tx.assistantConversation.update({ where: { id: input.conversationId }, data: { lastActivityAt: now } });
    });
  }

  async function finalizeWithoutTool(input: FinalizeWithoutToolInput, options: { transaction?: Prisma.TransactionClient } = {}): Promise<void> {
    assertAssistantMessageLength(input.assistantContent);
    const work = async (tx: Prisma.TransactionClient) => {
      const now = new Date();
      await tx.assistantMessage.create({ data: {
        conversationId: input.conversationId,
        turnId: input.turnId,
        role: 'ASSISTANT',
        source: input.assistantSource,
        content: input.assistantContent,
      } });
      await tx.assistantTurn.update({ where: { id: input.turnId }, data: {
        status: input.turnStatus,
        safeErrorCode: input.safeErrorCode,
        finishedAt: now,
      } });
      await tx.assistantConversation.update({ where: { id: input.conversationId }, data: { lastActivityAt: now } });
    };
    if (options.transaction) await work(options.transaction);
    else await db.$transaction(work);
  }

  async function listOwnedConversations(userId: string, page?: number, limit?: number): Promise<Page<ConversationSummaryDto>> {
    const p = pageArgs(page, limit);
    const where = { userId };
    const [rows, total] = await Promise.all([
      db.assistantConversation.findMany({ where, orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }], skip: p.skip, take: p.limit,
        include: { messages: { where: { role: { in: ['USER', 'ASSISTANT'] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } } }),
      db.assistantConversation.count({ where }),
    ]);
    return { items: rows.map((row) => ({
      id: row.id, status: row.status, locale: row.locale, createdAt: row.createdAt,
      updatedAt: row.updatedAt, lastActivityAt: row.lastActivityAt,
      lastMessage: row.messages[0]?.content.slice(0, 160),
    })), page: p.page, limit: p.limit, total, hasMore: p.skip + rows.length < total };
  }

  async function getOwnedConversation(userId: string, id: string, page?: number, limit?: number) {
    const conversation = await owned(userId, id);
    const p = pageArgs(page, limit);
    const where = { conversationId: id };
    const [messages, total, turns] = await Promise.all([
      db.assistantMessage.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: p.skip, take: p.limit }),
      db.assistantMessage.count({ where }),
      db.assistantTurn.findMany({ where: { conversationId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: {
        id: true, correlationId: true, status: true, intent: true, safeErrorCode: true, startedAt: true, finishedAt: true,
        toolExecutions: { orderBy: [{ startedAt: 'asc' }, { id: 'asc' }], select: {
          id: true, toolId: true, capability: true, riskLevel: true, policyDecision: true, status: true,
          correlationId: true, startedAt: true, completedAt: true, durationMs: true, safeErrorCode: true,
        } },
      } }),
    ]);
    return { conversation: { id: conversation.id, status: conversation.status, locale: conversation.locale, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt, lastActivityAt: conversation.lastActivityAt }, messages: { items: messages as ConversationMessageDto[], page: p.page, limit: p.limit, total, hasMore: p.skip + messages.length < total }, turns };
  }

  async function archiveOwnedConversation(userId: string, id: string) {
    const conversation = await owned(userId, id);
    if (conversation.status === 'ARCHIVED') return { id, status: conversation.status, archivedAt: conversation.archivedAt };
    if (conversation.status === 'EXPIRED') throw AssistantError.conversationNotContinuable();
    const updated = await db.assistantConversation.update({ where: { id }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
    return { id: updated.id, status: updated.status, archivedAt: updated.archivedAt };
  }

  return { assertContinuable, assertOwned: owned, establishConversation, beginTurn, markTurnRunning, beginToolExecution, finalize, finalizeRejected, finalizeWithoutTool, listOwnedConversations, getOwnedConversation, archiveOwnedConversation };
}

export type AssistantConversationService = ReturnType<typeof createAssistantConversationService>;

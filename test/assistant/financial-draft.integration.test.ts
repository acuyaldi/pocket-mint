import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPrismaResources } from '../../src/lib/prismaFactory';
import { assertTestDatabaseUrl } from '../../src/lib/assertTestDatabaseUrl';
import { createAssistantConversationService } from '../../src/assistant/conversation.service';
import { createAssistantApplicationService } from '../../src/assistant/application.service';
import { createAssistantFinancialDraftService } from '../../src/assistant/financial-draft.service';
import { createTransactionService } from '../../src/services/transaction.service';
import { ToolRegistry } from '../../src/assistant/registry';
import { monthlySpendingSummary, transactionCreate } from '../../src/assistant/tools';
import { createAssistantControllers } from '../../src/controllers/assistant.controller';
import { correlationMiddleware } from '../../src/http/correlation';
import { errorHandler } from '../../src/middlewares/error.middleware';

const url = process.env.TEST_DATABASE_URL;
if (url) assertTestDatabaseUrl(url);
const resources = url ? createPrismaResources(url, { max: 12 }) : undefined;
const users: string[] = [];
afterAll(() => resources?.close());
afterEach(async () => { if (resources && users.length) await resources.prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } }); });

describe.skipIf(!url)('Assistant financial drafts (disposable PostgreSQL)', () => {
  async function fixture(label: string) {
    const user = await resources!.prisma.user.create({ data: { email: `${label}-${Date.now()}-${Math.random()}@test.local`, name: label } });
    users.push(user.id);
    const wallet = await resources!.prisma.wallet.create({ data: { userId: user.id, name: 'Cash', type: 'CASH', balance: 100000 } });
    const category = await resources!.prisma.category.create({ data: { userId: user.id, name: 'Food', type: 'EXPENSE', icon: 'food', color: '#000000' } });
    return { user, wallet, category };
  }
  function categoryFor(userId: string, name: string, type: 'INCOME' | 'EXPENSE') {
    return resources!.prisma.category.create({
      data: { userId, name, type, icon: 'test', color: '#000000' },
    });
  }
  function app(clock?: () => Date) {
    const conversations = createAssistantConversationService(resources!.prisma);
    const drafts = createAssistantFinancialDraftService(resources!.prisma, createTransactionService(resources!.prisma), clock);
    const registry = new ToolRegistry(); registry.register(monthlySpendingSummary); registry.register(transactionCreate);
    const application = createAssistantApplicationService({ conversations, toolRegistry: registry, handlerRegistry: new Map(), financialDrafts: drafts });
    const controllers = createAssistantControllers(application, conversations, drafts);
    const server = express(); server.use(express.json()); server.use(correlationMiddleware);
    server.use((req, _res, next) => { (req as any).auth = { userId: req.header('x-test-user') }; next(); });
    server.post('/execute', controllers.execute); server.post('/drafts/:draftId/confirm', controllers.confirmDraft);
    server.post('/drafts/:draftId/cancel', controllers.cancelDraft); server.get('/conversations/:conversationId', controllers.get);
    server.use(errorHandler); return server;
  }
  const draftBody = (walletId: string, categoryId: string) => ({ intent: 'transaction.create', arguments: { type: 'EXPENSE', amount: '12500.50', walletId, categoryId, date: '2026-07-22', description: 'Lunch' } });

  it('creates only a pending draft, then confirms once and replays the durable result', async () => {
    const { user, wallet, category } = await fixture('flow'); const server = app();
    const prepared = await request(server).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id));
    expect(prepared.status).toBe(200); expect(prepared.body.data.data).toMatchObject({ status: 'PENDING_CONFIRMATION', confirmationRequired: true });
    expect(prepared.body.data.data.preview).toMatchObject({ category: 'Food' });
    expect(prepared.body.data.data.preview).not.toHaveProperty('categoryId');
    expect(prepared.body.data.data.renderedText).toContain('kategori Food');
    expect(prepared.body.data.data.renderedText).not.toContain(category.id);
    expect(await resources!.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
    expect((await resources!.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance.toString()).toBe('100000');
    const draftId = prepared.body.data.data.draftId;
    const first = await request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'flow-key');
    const replay = await request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'flow-key');
    const different = await request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'another-key');
    expect(first.status).toBe(200); expect(replay.status).toBe(200); expect(different.status).toBe(200);
    expect(first.body.data.transactionId).toBe(replay.body.data.transactionId);
    expect(first.body.data).not.toHaveProperty('idempotencyOutcome');
    expect(replay.body.data).not.toHaveProperty('idempotencyOutcome');
    expect(await resources!.prisma.transaction.count({ where: { userId: user.id } })).toBe(1);
    expect((await resources!.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance.toString()).toBe('87499.5');
    const history = await request(server).get(`/conversations/${prepared.body.data.conversationId}`).set('x-test-user', user.id);
    expect(history.body.data.turns).toHaveLength(2);
    expect(JSON.stringify(history.body.data.turns)).not.toContain('12500.50');
  });

  it.each([
    ['cross-owner', async () => {
      const owner = await fixture('category-owner');
      const other = await fixture('category-other');
      return {
        userId: owner.user.id,
        walletId: owner.wallet.id,
        categoryId: other.category.id,
      };
    }],
    ['opposite-type', async () => {
      const owner = await fixture('category-type');
      const income = await categoryFor(owner.user.id, 'Salary', 'INCOME');
      return {
        userId: owner.user.id,
        walletId: owner.wallet.id,
        categoryId: income.id,
      };
    }],
  ])('rejects %s compatibility categoryId without creating a draft', async (_label, arrange) => {
    const input = await arrange();

    const response = await request(app())
      .post('/execute')
      .set('x-test-user', input.userId)
      .send(draftBody(input.walletId, input.categoryId));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ASSISTANT_DRAFT_NOT_FOUND');
    expect(await resources!.prisma.assistantFinancialDraft.count({
      where: { userId: input.userId },
    })).toBe(0);
    expect(await resources!.prisma.transaction.count({
      where: { userId: input.userId },
    })).toBe(0);
  });

  it('serializes concurrent confirmations to exactly one transaction', async () => {
    const { user, wallet, category } = await fixture('concurrent'); const server = app();
    const prepared = await request(server).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id));
    const draftId = prepared.body.data.data.draftId;
    const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', `concurrent-${index}`)));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(await resources!.prisma.transaction.count({ where: { userId: user.id } })).toBe(1);
  });

  it('replays six concurrent confirmations using the same key', async () => {
    const { user, wallet, category } = await fixture('concurrent-same-key'); const server = app();
    const prepared = await request(server).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id));
    const draftId = prepared.body.data.data.draftId;
    const responses = await Promise.all(Array.from({ length: 6 }, () => request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'one-concurrent-key')));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(new Set(responses.map((response) => response.body.data.transactionId)).size).toBe(1);
    expect(await resources!.prisma.transaction.count({ where: { userId: user.id } })).toBe(1);
  });

  it('binds one concurrently reused key to at most one of two drafts', async () => {
    const { user, wallet, category } = await fixture('concurrent-cross-draft'); const server = app();
    const [first, second] = await Promise.all([
      request(server).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id)),
      request(server).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id)),
    ]);
    const responses = await Promise.all([first, second].map((prepared) => request(server).post(`/drafts/${prepared.body.data.data.draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'cross-draft-key')));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await resources!.prisma.transaction.count({ where: { userId: user.id } })).toBe(1);
    expect(await resources!.prisma.assistantFinancialDraft.count({ where: { userId: user.id, status: 'PENDING_CONFIRMATION' } })).toBe(1);
  });

  it.each([
    ['one millisecond before expiry', -1, 200, 'COMMITTED'],
    ['exactly at expiry', 0, 409, 'EXPIRED'],
    ['one millisecond after expiry', 1, 409, 'EXPIRED'],
  ])('enforces expiry %s using the server clock', async (_label, offsetMs, expectedHttp, expectedStatus) => {
    const { user, wallet, category } = await fixture(`expiry-${offsetMs}`);
    const prepared = await request(app()).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id));
    const draftId = prepared.body.data.data.draftId;
    const draft = await resources!.prisma.assistantFinancialDraft.findUniqueOrThrow({ where: { id: draftId } });
    const server = app(() => new Date(draft.expiresAt.getTime() + offsetMs));
    const response = await request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', `expiry-${offsetMs}`);
    expect(response.status).toBe(expectedHttp);
    expect((await resources!.prisma.assistantFinancialDraft.findUniqueOrThrow({ where: { id: draftId } })).status).toBe(expectedStatus);
    expect(await resources!.prisma.transaction.count({ where: { userId: user.id } })).toBe(offsetMs < 0 ? 1 : 0);
  });

  it('prevents deleting the authoritative transaction behind a committed draft', async () => {
    const { user, wallet, category } = await fixture('delete-restrict'); const server = app();
    const prepared = await request(server).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id));
    const draftId = prepared.body.data.data.draftId;
    const confirmed = await request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'delete-restrict-key');
    await expect(resources!.prisma.transaction.delete({ where: { id: confirmed.body.data.transactionId } })).rejects.toMatchObject({ cause: { code: '23001' } });
  });

  it('rejects cross-user confirmation without revealing ownership', async () => {
    const owner = await fixture('owner'); const other = await fixture('other'); const server = app();
    const prepared = await request(server).post('/execute').set('x-test-user', owner.user.id).send(draftBody(owner.wallet.id, owner.category.id));
    const response = await request(server).post(`/drafts/${prepared.body.data.data.draftId}/confirm`).set('x-test-user', other.user.id).set('Idempotency-Key', 'foreign-key');
    expect(response.status).toBe(404); expect(response.body.error.code).toBe('ASSISTANT_DRAFT_NOT_FOUND');
  });

  it('cancels idempotently and never permits a commit afterward', async () => {
    const { user, wallet, category } = await fixture('cancel'); const server = app();
    const prepared = await request(server).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id));
    const draftId = prepared.body.data.data.draftId;
    expect((await request(server).post(`/drafts/${draftId}/cancel`).set('x-test-user', user.id)).status).toBe(200);
    expect((await request(server).post(`/drafts/${draftId}/cancel`).set('x-test-user', user.id)).status).toBe(200);
    expect((await request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'cancelled-key')).status).toBe(409);
    expect(await resources!.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
  });

  it('rejects idempotency-key reuse across drafts and expires stale drafts on confirmation', async () => {
    const { user, wallet, category } = await fixture('key-expiry'); const server = app();
    const first = await request(server).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id));
    const second = await request(server).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id));
    await request(server).post(`/drafts/${first.body.data.data.draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'shared-key');
    const conflict = await request(server).post(`/drafts/${second.body.data.data.draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'shared-key');
    expect(conflict.status).toBe(409); expect(conflict.body.error.code).toBe('ASSISTANT_IDEMPOTENCY_CONFLICT');
    await resources!.prisma.assistantFinancialDraft.update({ where: { id: second.body.data.data.draftId }, data: { expiresAt: new Date(0) } });
    const expired = await request(server).post(`/drafts/${second.body.data.data.draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'fresh-key');
    expect(expired.status).toBe(409);
    expect((await resources!.prisma.assistantFinancialDraft.findUniqueOrThrow({ where: { id: second.body.data.data.draftId } })).status).toBe('EXPIRED');
  });

  it('does not allow a committed draft to be cancelled', async () => {
    const { user, wallet, category } = await fixture('committed-cancel'); const server = app();
    const prepared = await request(server).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id));
    const draftId = prepared.body.data.data.draftId;
    await request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'commit-key');
    expect((await request(server).post(`/drafts/${draftId}/cancel`).set('x-test-user', user.id)).status).toBe(409);
  });

  it('records a failed terminal lifecycle when the transaction domain rejects commit', async () => {
    const { user, wallet, category } = await fixture('domain-failure'); const server = app();
    const prepared = await request(server).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id));
    const draftId = prepared.body.data.data.draftId;
    await resources!.prisma.category.update({ where: { id: category.id }, data: { type: 'INCOME' } });
    const response = await request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'domain-failure-key');
    expect(response.status).toBe(400);
    expect(await resources!.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
    expect((await resources!.prisma.assistantFinancialDraft.findUniqueOrThrow({ where: { id: draftId } })).status).toBe('FAILED');
    const turns = await resources!.prisma.assistantTurn.findMany({ where: { conversationId: prepared.body.data.conversationId }, include: { toolExecutions: true } });
    expect(turns).toHaveLength(2); expect(turns[1].status).toBe('FAILED'); expect(turns[1].toolExecutions[0].outputSummary).toEqual({ draftId, status: 'FAILED' });
  });

  it('rejects confirmation without mutation when the Category is deleted after drafting', async () => {
    const { user, wallet, category } = await fixture('deleted-category');
    const server = app();
    const prepared = await request(server).post('/execute').set('x-test-user', user.id)
      .send(draftBody(wallet.id, category.id));
    const draftId = prepared.body.data.data.draftId;
    await resources!.prisma.category.delete({ where: { id: category.id } });

    const response = await request(server).post(`/drafts/${draftId}/confirm`)
      .set('x-test-user', user.id)
      .set('Idempotency-Key', 'deleted-category-key');

    expect(response.status).toBe(404);
    expect(await resources!.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
    expect((await resources!.prisma.wallet.findUniqueOrThrow({
      where: { id: wallet.id },
    })).balance.toString()).toBe('100000');
    expect((await resources!.prisma.assistantFinancialDraft.findUniqueOrThrow({
      where: { id: draftId },
    })).status).toBe('FAILED');
  });

  it('logs idempotency outcome and error category without exposing keys, amounts, or entity names', async () => {
    const { user, wallet, category } = await fixture('observability'); const server = app();
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const prepared = await request(server).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id));
      const draftId = prepared.body.data.data.draftId;
      await request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'observability-key');
      await request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'observability-key');
      const conflict = await request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'observability-other-key');
      expect(conflict.status).toBe(409);

      const infoLines = infoSpy.mock.calls.map((call) => call[0] as string);
      const errorLines = errorSpy.mock.calls.map((call) => call[0] as string);
      const confirmedEvents = infoLines.filter((line) => line.includes('"assistant.draft.confirmed"'));
      expect(confirmedEvents.some((line) => line.includes('"idempotencyOutcome":"new"'))).toBe(true);
      expect(confirmedEvents.some((line) => line.includes('"idempotencyOutcome":"replay"'))).toBe(true);
      expect(errorLines.some((line) => line.includes('"errorCategory":"idempotency"'))).toBe(true);

      const allLines = [...infoLines, ...errorLines];
      for (const line of allLines) {
        expect(line).not.toContain('observability-key');
        expect(line).not.toContain('observability-other-key');
        expect(line).not.toContain('12500.50');
        expect(line).not.toContain(wallet.id);
        expect(line).not.toContain(category.id);
        expect(line).not.toContain('Lunch');
      }
    } finally {
      infoSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('categorizes an expired confirmation attempt without exposing draft content', async () => {
    const { user, wallet, category } = await fixture('observability-expiry');
    const prepared = await request(app()).post('/execute').set('x-test-user', user.id).send(draftBody(wallet.id, category.id));
    const draftId = prepared.body.data.data.draftId;
    const draft = await resources!.prisma.assistantFinancialDraft.findUniqueOrThrow({ where: { id: draftId } });
    const server = app(() => new Date(draft.expiresAt.getTime() + 1));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(server).post(`/drafts/${draftId}/confirm`).set('x-test-user', user.id).set('Idempotency-Key', 'expiry-observability-key');
      expect(response.status).toBe(409);
      const lines = errorSpy.mock.calls.map((call) => call[0] as string);
      expect(lines.some((line) => line.includes('"errorCategory":"expired"'))).toBe(true);
      for (const line of lines) expect(line).not.toContain('expiry-observability-key');
    } finally {
      errorSpy.mockRestore();
    }
  });
});

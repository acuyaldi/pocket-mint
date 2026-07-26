// ============================================================
// Tests: GET /assistant/conversations/:conversationId/recovery-state
// ------------------------------------------------------------
// Real Postgres, real HTTP requests (supertest), real application/
// clarification/draft services. Verifies the read-only recovery-state
// projection: safe pass-through of AssistantStateProjection, ownership
// scoping identical to the existing conversation-detail route, and no
// token/tokenDigest/display-name leakage.
// ============================================================
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPrismaResources } from '../../src/lib/prismaFactory';
import { assertTestDatabaseUrl } from '../../src/lib/assertTestDatabaseUrl';
import { createAssistantConversationService } from '../../src/assistant/conversation.service';
import { createAssistantApplicationService } from '../../src/assistant/application.service';
import { createAssistantFinancialDraftService } from '../../src/assistant/financial-draft.service';
import { createClarificationService } from '../../src/assistant/clarification.service';
import { createTransactionService } from '../../src/services/transaction.service';
import { createAssistantControllers } from '../../src/controllers/assistant.controller';
import { correlationMiddleware } from '../../src/http/correlation';
import { errorHandler } from '../../src/middlewares/error.middleware';
import { ToolRegistry } from '../../src/assistant/registry';
import { monthlySpendingSummary, transactionCreate } from '../../src/assistant/tools';
import {
  EntityResolverRegistry,
  createEntityResolutionService,
  createWalletResolver,
  createMerchantResolver,
  createCategoryResolver,
} from '../../src/assistant/entity-resolution';

const url = process.env.TEST_DATABASE_URL;
if (url) assertTestDatabaseUrl(url);
const resources = url ? createPrismaResources(url, { max: 12 }) : undefined;
const users: string[] = [];
afterAll(() => resources?.close());
afterEach(async () => { if (resources && users.length) await resources.prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } }); });

describe.skipIf(!url)('GET /conversations/:conversationId/recovery-state (disposable PostgreSQL)', () => {
  const db = () => resources!.prisma;

  async function makeUser(label: string) {
    const row = await db().user.create({ data: { email: `${label}-${Date.now()}-${Math.random()}@test.local`, name: label } });
    users.push(row.id);
    return row.id;
  }

  function buildServer() {
    const conversations = createAssistantConversationService(db());
    const drafts = createAssistantFinancialDraftService(db(), createTransactionService(db()));
    const clarification = createClarificationService(db());
    const registry = new ToolRegistry();
    registry.register(monthlySpendingSummary);
    registry.register(transactionCreate);

    const entityResolverRegistry = new EntityResolverRegistry();
    entityResolverRegistry.register(createWalletResolver(db()));
    entityResolverRegistry.register(createMerchantResolver(db()));
    entityResolverRegistry.register(createCategoryResolver(db()));
    entityResolverRegistry.finalize();
    const entityResolution = createEntityResolutionService(entityResolverRegistry);

    const application = createAssistantApplicationService({
      conversations, toolRegistry: registry, handlerRegistry: new Map(),
      financialDrafts: drafts, entityResolution, clarification,
    });

    const controllers = createAssistantControllers(application, conversations, drafts);
    const server = express();
    server.use(express.json());
    server.use(correlationMiddleware);
    server.use((req, _res, next) => {
      const testUser = req.header('x-test-user');
      if (testUser) (req as any).auth = { userId: testUser };
      next();
    });
    server.post('/execute', controllers.execute);
    server.get('/conversations/:conversationId/recovery-state', controllers.recoveryState);
    server.use(errorHandler);
    return server;
  }

  async function walletAmbiguityFixture(label: string) {
    const userId = await makeUser(label);
    const walletA = await db().wallet.create({ data: { userId, name: 'BCA Debit', type: 'BANK', balance: 500000 } });
    const walletB = await db().wallet.create({ data: { userId, name: 'BCA Payroll', type: 'BANK', balance: 1000000 } });
    const category = await db().category.create({ data: { userId, name: 'Food', type: 'EXPENSE', icon: 'food', color: '#000000' } });
    return { userId, walletA, walletB, category };
  }

  function executeEnvelope(res: request.Response): any {
    return res.body.success ? res.body.data : res.body.error;
  }

  // ==========================================================================
  // 1. No active workflow
  // ==========================================================================

  it('returns 200 with an empty projection when there is no active clarification or draft', async () => {
    const server = buildServer();
    const userId = await makeUser('no-state');
    const conversation = await db().assistantConversation.create({ data: { userId, locale: 'id-ID' } });

    const res = await request(server).get(`/conversations/${conversation.id}/recovery-state`).set('x-test-user', userId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({});
  });

  // ==========================================================================
  // 2. Active PENDING clarification
  // ==========================================================================

  it('returns activeClarification with safe option labels and no token/tokenDigest', async () => {
    const server = buildServer();
    const { userId, category } = await walletAmbiguityFixture('active-clar');

    const created = await request(server).post('/execute').set('x-test-user', userId).send({
      intent: 'transaction.create',
      arguments: { type: 'EXPENSE', amount: '50000', walletReference: 'BCA', categoryId: category.id, date: '2026-07-24' },
    });
    const body = executeEnvelope(created);
    expect(body.status).toBe('clarification_required');
    const conversationId = body.conversationId;
    const clar = body.data.clarification;
    const rawToken = clar.options[0].token as string;

    const res = await request(server).get(`/conversations/${conversationId}/recovery-state`).set('x-test-user', userId);

    expect(res.status).toBe(200);
    expect(res.body.data.activeClarification).toMatchObject({
      clarificationId: clar.clarificationId,
      entityType: 'wallet',
      prompt: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(res.body.data.activeClarification.options[0]).toHaveProperty('label');
    expect(res.body.data.activeClarification.options[0]).not.toHaveProperty('token');
    expect(res.body.data.activeClarification.options[0]).not.toHaveProperty('tokenDigest');
    expect(res.body.data.pendingDraft).toBeUndefined();

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(rawToken);
    expect(raw).not.toContain('tokenDigest');
    expect(raw).not.toContain('clarify_');

    // Confirm against the DB digest directly, to be certain no digest of any
    // persisted option leaked either.
    const dbOptions = await db().clarificationOption.findMany({ where: { requestId: clar.clarificationId } });
    for (const opt of dbOptions) expect(raw).not.toContain(opt.tokenDigest);
  });

  // ==========================================================================
  // 3. Active PENDING_CONFIRMATION draft
  // ==========================================================================

  it('returns pendingDraft with id-only preview fields, no names, no committed data', async () => {
    const server = buildServer();
    const userId = await makeUser('active-draft');
    const wallet = await db().wallet.create({ data: { userId, name: 'Cash', type: 'CASH', balance: 100000 } });
    const category = await db().category.create({ data: { userId, name: 'Food', type: 'EXPENSE', icon: 'food', color: '#000000' } });

    const created = await request(server).post('/execute').set('x-test-user', userId).send({
      intent: 'transaction.create',
      arguments: { type: 'EXPENSE', amount: '12500.50', walletId: wallet.id, categoryId: category.id, date: '2026-07-22', description: 'Lunch' },
    });
    const body = executeEnvelope(created);
    expect(body.status).toBe('success');
    const conversationId = body.conversationId;
    const draftId = body.data.draftId;

    const res = await request(server).get(`/conversations/${conversationId}/recovery-state`).set('x-test-user', userId);

    expect(res.status).toBe(200);
    expect(res.body.data.pendingDraft).toMatchObject({
      draftId,
      status: 'PENDING_CONFIRMATION',
      preview: {
        amount: '12500.5',
        walletId: wallet.id,
        categoryId: category.id,
        expiresAt: expect.any(String),
      },
    });
    expect(res.body.data.pendingDraft).not.toHaveProperty('transactionId');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('Cash');
    expect(raw).not.toContain('Food');
    expect(res.body.data.activeClarification).toBeUndefined();
  });

  // ==========================================================================
  // 4. Nonexistent conversationId
  // ==========================================================================

  it('returns 404 ASSISTANT_CONVERSATION_NOT_FOUND for a nonexistent conversationId', async () => {
    const server = buildServer();
    const userId = await makeUser('missing-conv');

    const res = await request(server).get('/conversations/does-not-exist/recovery-state').set('x-test-user', userId);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ASSISTANT_CONVERSATION_NOT_FOUND');
  });

  // ==========================================================================
  // 5. Cross-user conversation
  // ==========================================================================

  it('returns 404 ASSISTANT_CONVERSATION_NOT_FOUND for another user\'s conversation, identical to the not-found case', async () => {
    const server = buildServer();
    const owner = await makeUser('owner-recstate');
    const other = await makeUser('other-recstate');
    const conversation = await db().assistantConversation.create({ data: { userId: owner, locale: 'id-ID' } });

    const [notFound, crossUser] = await Promise.all([
      request(server).get('/conversations/does-not-exist/recovery-state').set('x-test-user', other),
      request(server).get(`/conversations/${conversation.id}/recovery-state`).set('x-test-user', other),
    ]);

    expect(crossUser.status).toBe(404);
    expect(crossUser.body).toEqual(notFound.body);
  });

  // ==========================================================================
  // 6. Malformed conversationId
  // ==========================================================================

  it('returns 404, not 400/500, for a malformed conversationId', async () => {
    const server = buildServer();
    const userId = await makeUser('malformed-conv');

    const res = await request(server).get('/conversations/not-a-valid-cuid-!!!/recovery-state').set('x-test-user', userId);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ASSISTANT_CONVERSATION_NOT_FOUND');
  });

  // ==========================================================================
  // 7. Unauthenticated
  // ==========================================================================

  it('returns 401 when unauthenticated', async () => {
    const server = buildServer();
    const userId = await makeUser('unauth-recstate');
    const conversation = await db().assistantConversation.create({ data: { userId, locale: 'id-ID' } });

    const res = await request(server).get(`/conversations/${conversation.id}/recovery-state`);

    expect(res.status).toBe(401);
  });
});

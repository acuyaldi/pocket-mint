// ============================================================
// Tests: Clarification HTTP endpoints (disposable PostgreSQL)
// ------------------------------------------------------------
// Real Postgres row locks, real HTTP requests (supertest), real
// application/clarification/draft services. Verifies the full
// wallet -> merchant -> category -> draft chain over HTTP, owner
// and conversation scoping, replay/concurrency safety, and that
// no financial mutation or provider call ever occurs during
// clarification continuation.
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

describe.skipIf(!url)('Clarification HTTP endpoints (disposable PostgreSQL)', () => {
  const db = () => resources!.prisma;

  async function makeUser(label: string) {
    const row = await db().user.create({ data: { email: `${label}-${Date.now()}-${Math.random()}@test.local`, name: label } });
    users.push(row.id);
    return row.id;
  }

  /** Full server: real services against real Postgres, no provider wired (structurally zero provider calls). */
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
    server.post('/conversations/:conversationId/clarifications/:clarificationId/select', controllers.selectClarification);
    server.post('/conversations/:conversationId/clarifications/:clarificationId/cancel', controllers.cancelClarification);
    server.use(errorHandler);
    return { server, application, clarification, drafts, conversations };
  }

  async function walletAmbiguityFixture(label: string) {
    const userId = await makeUser(label);
    const walletA = await db().wallet.create({ data: { userId, name: 'BCA Debit', type: 'BANK', balance: 500000 } });
    const walletB = await db().wallet.create({ data: { userId, name: 'BCA Payroll', type: 'BANK', balance: 1000000 } });
    const category = await db().category.create({ data: { userId, name: 'Food', type: 'EXPENSE', icon: 'food', color: '#000000' } });
    return { userId, walletA, walletB, category };
  }

  async function fullChainFixture(label: string) {
    const userId = await makeUser(label);
    const walletA = await db().wallet.create({ data: { userId, name: 'BCA Debit', type: 'BANK', balance: 500000 } });
    const walletB = await db().wallet.create({ data: { userId, name: 'BCA Payroll', type: 'BANK', balance: 1000000 } });
    const catA = await db().category.create({ data: { userId, name: 'Makan Siang', type: 'EXPENSE', icon: 'food', color: '#000000' } });
    const catB = await db().category.create({ data: { userId, name: 'Makan Malam', type: 'EXPENSE', icon: 'food', color: '#111111' } });
    await db().merchantMapping.create({ data: { userId, merchantName: 'Warteg Bahari', normalizedMerchant: 'warteg bahari', categoryId: catA.id } });
    await db().merchantMapping.create({ data: { userId, merchantName: 'Warteg Barokah', normalizedMerchant: 'warteg barokah', categoryId: catA.id } });
    return { userId, walletA, walletB, catA, catB };
  }

  /**
   * /execute wraps a 'success' response under `.data` and every other status
   * (including 'clarification_required', still HTTP 200) under `.error` — an
   * existing, unrelated convention of that endpoint. This unwraps either.
   */
  function executeEnvelope(res: request.Response): any {
    return res.body.success ? res.body.data : res.body.error;
  }

  async function createWalletAmbiguity(server: express.Express, userId: string, categoryId: string, overrides: Record<string, unknown> = {}) {
    const res = await request(server).post('/execute').set('x-test-user', userId).send({
      intent: 'transaction.create',
      arguments: { type: 'EXPENSE', amount: '50000', walletReference: 'BCA', categoryId, date: '2026-07-24', ...overrides },
    });
    const body = executeEnvelope(res);
    expect(body.status).toBe('clarification_required');
    return body;
  }

  // ==========================================================================
  // 1. Wallet clarification selected through HTTP
  // ==========================================================================

  it('selects a wallet clarification through HTTP and returns a child clarification or pending draft', async () => {
    const { server } = buildServer();
    const { userId, category } = await walletAmbiguityFixture('http-wallet');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;

    const res = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: clar.options[0].token });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(['clarification_required', 'success']).toContain(res.body.data.status);
  });

  // ==========================================================================
  // 2. Exact sequential HTTP path: wallet -> merchant -> category -> draft
  // ==========================================================================

  it('completes the full wallet -> merchant -> category -> draft chain entirely over HTTP', async () => {
    const { server } = buildServer();
    const { userId, walletA, walletB } = await fullChainFixture('http-chain');

    const r1 = await request(server).post('/execute').set('x-test-user', userId).send({
      intent: 'transaction.create',
      arguments: { type: 'EXPENSE', amount: '50000', walletReference: 'BCA', merchantReference: 'Warteg', categoryReference: 'Makan', date: '2026-07-24', description: 'Makan siang di warteg' },
    });
    const r1Body = executeEnvelope(r1);
    expect(r1Body.status).toBe('clarification_required');
    expect(r1Body.data.kind).toBe('entity_selection');
    expect(r1Body.data.entityType).toBe('wallet');
    const conversationId = r1Body.conversationId;
    const walletClar = r1Body.data.clarification;

    const r2 = await request(server)
      .post(`/conversations/${conversationId}/clarifications/${walletClar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: walletClar.options[0].token });
    expect(r2.status).toBe(200);
    expect(r2.body.data.status).toBe('clarification_required');
    expect(r2.body.data.data.kind).toBe('entity_selection');
    expect(r2.body.data.data.entityType).toBe('merchant');
    const merchantClar = r2.body.data.data.clarification;

    const r3 = await request(server)
      .post(`/conversations/${conversationId}/clarifications/${merchantClar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: merchantClar.options[0].token });
    expect(r3.status).toBe(200);
    expect(r3.body.data.status).toBe('clarification_required');
    expect(r3.body.data.data.kind).toBe('entity_selection');
    expect(r3.body.data.data.entityType).toBe('category');
    const categoryClar = r3.body.data.data.clarification;

    const r4 = await request(server)
      .post(`/conversations/${conversationId}/clarifications/${categoryClar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: categoryClar.options[0].token });
    expect(r4.status).toBe(200);
    expect(r4.body.data.status).toBe('success');
    expect(r4.body.data.data).toHaveProperty('draftId');

    // Financial safety
    expect(await db().transaction.count({ where: { userId } })).toBe(0);
    expect((await db().wallet.findUniqueOrThrow({ where: { id: walletA.id } })).balance.toString()).toBe('500000');
    expect((await db().wallet.findUniqueOrThrow({ where: { id: walletB.id } })).balance.toString()).toBe('1000000');
    const drafts = await db().assistantFinancialDraft.findMany({ where: { userId } });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.status).toBe('PENDING_CONFIRMATION');

    // Exactly 3 clarifications, all consumed
    const clarifications = await db().clarificationRequest.findMany({ where: { userId } });
    expect(clarifications).toHaveLength(3);
    for (const c of clarifications) expect(c.status).toBe('CONSUMED');
  });

  // ==========================================================================
  // 3. Cross-owner attack
  // ==========================================================================

  it('treats a cross-owner clarification select as not found, and leaves the victim clarification PENDING', async () => {
    const { server } = buildServer();
    const victim = await walletAmbiguityFixture('http-victim');
    const attackerId = await makeUser('http-attacker');
    const attackerConv = await db().assistantConversation.create({ data: { userId: attackerId, locale: 'id-ID' } });

    const created = await createWalletAmbiguity(server, victim.userId, victim.category.id);
    const clar = created.data.clarification;

    // Attacker uses their OWN conversation id with the victim's clarification id + stolen token.
    const attack1 = await request(server)
      .post(`/conversations/${attackerConv.id}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', attackerId)
      .send({ optionToken: clar.options[0].token });
    expect(attack1.status).toBe(404);

    // Attacker also tries the victim's conversation id directly (classic IDOR) — conversation ownership check rejects it first.
    const attack2 = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', attackerId)
      .send({ optionToken: clar.options[0].token });
    expect(attack2.status).toBe(404);

    const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clar.clarificationId } });
    expect(dbClar.status).toBe('PENDING');
  });

  // ==========================================================================
  // 4. Cross-conversation attack (same owner)
  // ==========================================================================

  it('treats a cross-conversation clarification select as not found, and the original clarification remains usable', async () => {
    const { server } = buildServer();
    const { userId, walletA, walletB, category } = await walletAmbiguityFixture('http-crossconv');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;

    const otherConv = await db().assistantConversation.create({ data: { userId, locale: 'id-ID' } });

    const wrong = await request(server)
      .post(`/conversations/${otherConv.id}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: clar.options[0].token });
    expect(wrong.status).toBe(404);

    const right = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: clar.options[0].token });
    expect(right.status).toBe(200);
    void walletA; void walletB;
  });

  // ==========================================================================
  // 5. Replay
  // ==========================================================================

  it('rejects a replayed select with already-consumed, leaving exactly one child/draft', async () => {
    const { server } = buildServer();
    const { userId, category } = await walletAmbiguityFixture('http-replay');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;

    const first = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: clar.options[0].token });
    expect(first.status).toBe(200);

    const second = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: clar.options[0].token });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ASSISTANT_CLARIFICATION_ALREADY_CONSUMED');

    const childCount = await db().clarificationRequest.count({ where: { userId, parentId: clar.clarificationId } });
    const draftCount = await db().assistantFinancialDraft.count({ where: { userId } });
    expect(childCount + draftCount).toBe(1);
  });

  // ==========================================================================
  // 6. Concurrent same-token HTTP requests
  // ==========================================================================

  it('resolves concurrent same-token HTTP requests to exactly one success', async () => {
    const { server } = buildServer();
    const { userId, category } = await walletAmbiguityFixture('http-concurrent');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;

    const attempts = await Promise.all(Array.from({ length: 5 }, () =>
      request(server)
        .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
        .set('x-test-user', userId)
        .send({ optionToken: clar.options[0].token }),
    ));

    const successes = attempts.filter((r) => r.status === 200);
    const conflicts = attempts.filter((r) => r.status === 409 && r.body.error.code === 'ASSISTANT_CLARIFICATION_ALREADY_CONSUMED');
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(4);

    const childCount = await db().clarificationRequest.count({ where: { userId, parentId: clar.clarificationId } });
    const draftCount = await db().assistantFinancialDraft.count({ where: { userId } });
    expect(childCount + draftCount).toBe(1);
  });

  // ==========================================================================
  // 7. Select versus cancel race
  // ==========================================================================

  it('resolves a concurrent select-vs-cancel race to exactly one terminal transition', async () => {
    const { server } = buildServer();
    const { userId, category } = await walletAmbiguityFixture('http-race');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;

    const [selectRes, cancelRes] = await Promise.all([
      request(server)
        .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
        .set('x-test-user', userId)
        .send({ optionToken: clar.options[0].token }),
      request(server)
        .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/cancel`)
        .set('x-test-user', userId)
        .send({}),
    ]);

    const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clar.clarificationId } });
    expect(dbClar.status).not.toBe('PENDING');
    expect(['CONSUMED', 'CANCELLED']).toContain(dbClar.status);

    if (dbClar.status === 'CONSUMED') {
      expect(selectRes.status).toBe(200);
      const childCount = await db().clarificationRequest.count({ where: { userId, parentId: clar.clarificationId } });
      const draftCount = await db().assistantFinancialDraft.count({ where: { userId } });
      expect(childCount + draftCount).toBe(1);
    } else {
      expect(cancelRes.status).toBe(200);
      expect(await db().clarificationRequest.count({ where: { userId, parentId: clar.clarificationId } })).toBe(0);
      expect(await db().assistantFinancialDraft.count({ where: { userId } })).toBe(0);
    }
  });

  // ==========================================================================
  // 9. Invalid token
  // ==========================================================================

  it('rejects an invalid token with a bounded response, leaves the clarification PENDING, and still allows the valid token afterward', async () => {
    const { server } = buildServer();
    const { userId, category } = await walletAmbiguityFixture('http-invalid-token');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;

    const bad = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: 'clarify_totally_bogus_token_00000000000000000000' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('ASSISTANT_CLARIFICATION_INVALID_OPTION');

    const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clar.clarificationId } });
    expect(dbClar.status).toBe('PENDING');

    const good = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: clar.options[0].token });
    expect(good.status).toBe(200);
  });

  // ==========================================================================
  // 10. Malformed persisted context
  // ==========================================================================

  it('returns a safe context-invalid response for a malformed persisted trustedContext, with no parser details', async () => {
    const { server } = buildServer();
    const { userId, category } = await walletAmbiguityFixture('http-badcontext');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;

    await db().clarificationRequest.update({
      where: { id: clar.clarificationId },
      data: { trustedContext: { garbage: true } as never },
    });

    const res = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: clar.options[0].token });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ASSISTANT_CLARIFICATION_CONTEXT_INVALID');
    const body = JSON.stringify(res.body).toLowerCase();
    expect(body).not.toContain('json');
    expect(body).not.toContain('parse');
    expect(body).not.toContain('unexpected token');

    const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clar.clarificationId } });
    expect(dbClar.status).toBe('STALE');
    expect(dbClar.restartRequired).toBe(true);
  });

  // ==========================================================================
  // 11 & 12. Financial and provider safety (asserted throughout, summarized here)
  // ==========================================================================

  it('creates zero Transaction rows and mutates no wallet balance across an HTTP cancel', async () => {
    const { server } = buildServer();
    const { userId, walletA, walletB, category } = await walletAmbiguityFixture('http-cancel-safety');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;

    const res = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/cancel`)
      .set('x-test-user', userId)
      .send({});
    expect(res.status).toBe(200);

    expect(await db().transaction.count({ where: { userId } })).toBe(0);
    expect((await db().wallet.findUniqueOrThrow({ where: { id: walletA.id } })).balance.toString()).toBe('500000');
    expect((await db().wallet.findUniqueOrThrow({ where: { id: walletB.id } })).balance.toString()).toBe('1000000');

    const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clar.clarificationId } });
    expect(dbClar.status).toBe('CANCELLED');
    expect(dbClar.restartRequired).toBe(true);

    // Repeated cancellation is deterministic and safe (idempotent no-op success).
    const again = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/cancel`)
      .set('x-test-user', userId)
      .send({});
    expect(again.status).toBe(200);
  });

  it('unauthenticated select and cancel are both rejected with 401', async () => {
    const { server } = buildServer();
    const { userId, category } = await walletAmbiguityFixture('http-unauth');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;

    const select = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .send({ optionToken: clar.options[0].token });
    expect(select.status).toBe(401);

    const cancel = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/cancel`)
      .send({});
    expect(cancel.status).toBe(401);

    const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clar.clarificationId } });
    expect(dbClar.status).toBe('PENDING');
  });
});

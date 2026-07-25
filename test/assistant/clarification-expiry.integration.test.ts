// ============================================================
// Tests: Clarification lifecycle expiry (disposable PostgreSQL)
// ------------------------------------------------------------
// Real Postgres, real database time, real HTTP requests. Verifies
// ASSISTANT_CLARIFICATION_EXPIRED — ordering (expiry resolved before
// token validation), deterministic repeat behavior, no rewrite of
// other terminal states, and that the select claim + downstream
// child/draft creation + Assistant lifecycle persistence roll back
// together on a transient failure.
// ============================================================
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPrismaResources } from '../../src/lib/prismaFactory';
import { assertTestDatabaseUrl } from '../../src/lib/assertTestDatabaseUrl';
import { createAssistantConversationService } from '../../src/assistant/conversation.service';
import { createAssistantApplicationService } from '../../src/assistant/application.service';
import { createAssistantFinancialDraftService } from '../../src/assistant/financial-draft.service';
import { CLARIFICATION_TTL_MS, createClarificationService } from '../../src/assistant/clarification.service';
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

describe.skipIf(!url)('Clarification lifecycle expiry (disposable PostgreSQL)', () => {
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
    server.post('/conversations/:conversationId/clarifications/:clarificationId/select', controllers.selectClarification);
    server.post('/conversations/:conversationId/clarifications/:clarificationId/cancel', controllers.cancelClarification);
    server.use(errorHandler);
    return { server, clarification };
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

  async function createWalletAmbiguity(server: express.Express, userId: string, categoryId: string) {
    const res = await request(server).post('/execute').set('x-test-user', userId).send({
      intent: 'transaction.create',
      arguments: { type: 'EXPENSE', amount: '50000', walletReference: 'BCA', categoryId, date: '2026-07-24' },
    });
    const body = executeEnvelope(res);
    expect(body.status).toBe('clarification_required');
    return body;
  }

  async function expireNow(clarificationId: string) {
    await db().clarificationRequest.update({ where: { id: clarificationId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  }

  // ==========================================================================
  // Service-level: creation, child expiry, ordering, determinism
  // ==========================================================================

  it('sets expiresAt to approximately 15 minutes after database-backed creation time', async () => {
    const { clarification } = buildServer();
    const { userId, category } = await walletAmbiguityFixture('exp-create');
    const conversation = await db().assistantConversation.create({ data: { userId, locale: 'id-ID' } });
    const turn = await db().assistantTurn.create({ data: { conversationId: conversation.id, correlationId: 'corr-create', intent: 'transaction.create', locale: 'id-ID' } });
    const execution = await db().assistantToolExecution.create({ data: { conversationId: conversation.id, turnId: turn.id, correlationId: 'corr-create', toolId: 'transaction.create', capability: 'transaction.create', riskLevel: 'HIGH', policyDecision: 'DRAFT_AND_CONFIRM', status: 'RUNNING' } });

    const before = new Date();
    const created = await clarification.create({
      userId, conversationId: conversation.id, turnId: turn.id, executionId: execution.id,
      entityType: 'wallet',
      trustedContext: { version: 1, operation: 'transaction.create', type: 'EXPENSE', amount: '10000', date: '2026-07-24', resumeAt: new Date().toISOString(), category: { internalId: category.id, displayLabel: 'Food', categoryType: 'EXPENSE' } },
      prompt: 'Pilih wallet',
      options: [{ displayLabel: 'BCA Debit', discriminator: 'BANK', candidateId: 'wallet-x' }],
    });
    const after = new Date();

    expect(created.expiresAt).toBeDefined();
    const expiresAt = new Date(created.expiresAt!);
    const lowerBound = before.getTime() + CLARIFICATION_TTL_MS - 5000;
    const upperBound = after.getTime() + CLARIFICATION_TTL_MS + 5000;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(lowerBound);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(upperBound);
  });

  it('gives a child clarification its own fresh 15-minute expiry without extending the parent', async () => {
    const { server } = buildServer();
    const userId = await makeUser('exp-child');
    await db().wallet.create({ data: { userId, name: 'BCA Debit', type: 'BANK', balance: 500000 } });
    await db().wallet.create({ data: { userId, name: 'BCA Payroll', type: 'BANK', balance: 1000000 } });
    const cat = await db().category.create({ data: { userId, name: 'Makan Siang', type: 'EXPENSE', icon: 'food', color: '#000000' } });
    await db().merchantMapping.create({ data: { userId, merchantName: 'Warteg Bahari', normalizedMerchant: 'warteg bahari', categoryId: cat.id } });
    await db().merchantMapping.create({ data: { userId, merchantName: 'Warteg Barokah', normalizedMerchant: 'warteg barokah', categoryId: cat.id } });

    const r1 = await request(server).post('/execute').set('x-test-user', userId).send({
      intent: 'transaction.create',
      arguments: { type: 'EXPENSE', amount: '50000', walletReference: 'BCA', merchantReference: 'Warteg', categoryId: cat.id, date: '2026-07-24' },
    });
    const r1Body = executeEnvelope(r1);
    expect(r1Body.status).toBe('clarification_required');
    const walletClar = r1Body.data.clarification;
    const parentBefore = await db().clarificationRequest.findUniqueOrThrow({ where: { id: walletClar.clarificationId } });

    const res = await request(server)
      .post(`/conversations/${r1Body.conversationId}/clarifications/${walletClar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: walletClar.options[0].token });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('clarification_required');
    expect(res.body.data.data.entityType).toBe('merchant');

    const parentAfter = await db().clarificationRequest.findUniqueOrThrow({ where: { id: walletClar.clarificationId } });
    expect(parentAfter.expiresAt.getTime()).toBe(parentBefore.expiresAt.getTime());

    const childId = res.body.data.data.clarification.clarificationId;
    const child = await db().clarificationRequest.findUniqueOrThrow({ where: { id: childId } });
    expect(child.parentId).toBe(walletClar.clarificationId);
    expect(child.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(child.expiresAt.getTime()).not.toBe(parentAfter.expiresAt.getTime());
  });

  // ==========================================================================
  // Expired select / cancel
  // ==========================================================================

  it('returns the bounded expired outcome on select, persists the canonical terminal state, and is deterministic on repeat', async () => {
    const { server } = buildServer();
    const { userId, category } = await walletAmbiguityFixture('exp-select');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;
    await expireNow(clar.clarificationId);

    const first = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: clar.options[0].token });
    expect(first.status).toBe(409);
    expect(first.body.error.code).toBe('ASSISTANT_CLARIFICATION_EXPIRED');

    const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clar.clarificationId } });
    expect(dbClar.status).toBe('STALE');
    expect(dbClar.terminalCode).toBe('expired');
    expect(dbClar.restartRequired).toBe(true);

    // Repeat: deterministic, same bounded outcome, no state change.
    const second = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: clar.options[0].token });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ASSISTANT_CLARIFICATION_EXPIRED');

    // No side effects.
    expect(await db().clarificationRequest.count({ where: { userId, parentId: clar.clarificationId } })).toBe(0);
    expect(await db().assistantFinancialDraft.count({ where: { userId } })).toBe(0);
    expect(await db().transaction.count({ where: { userId } })).toBe(0);

    const body = JSON.stringify(first.body).toLowerCase();
    expect(body).not.toContain('tokendigest');
    expect(body).not.toContain('trustedcontext');
    expect(body).not.toContain('sql');
    expect(body).not.toContain('prisma');
  });

  it('returns the bounded expired outcome on cancel and persists the same canonical terminal state', async () => {
    const { server } = buildServer();
    const { userId, category } = await walletAmbiguityFixture('exp-cancel');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;
    await expireNow(clar.clarificationId);

    const res = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/cancel`)
      .set('x-test-user', userId)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ASSISTANT_CLARIFICATION_EXPIRED');

    const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clar.clarificationId } });
    expect(dbClar.status).toBe('STALE');
    expect(dbClar.terminalCode).toBe('expired');
  });

  it('an invalid/stolen token against an expired request still returns expired, not invalid-option', async () => {
    const { server } = buildServer();
    const { userId, category } = await walletAmbiguityFixture('exp-invalid-token');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;
    await expireNow(clar.clarificationId);

    const res = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: 'clarify_totally_bogus_token_00000000000000000000' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ASSISTANT_CLARIFICATION_EXPIRED');
  });

  it('does not rewrite an already-CONSUMED, CANCELLED, or STALE(other) request to expired', async () => {
    const { server } = buildServer();

    // CONSUMED: select for real, then even if expiresAt were in the past the
    // status guard (checked before expiry) reports ALREADY_CONSUMED.
    {
      const { userId, category } = await walletAmbiguityFixture('exp-consumed');
      const created = await createWalletAmbiguity(server, userId, category.id);
      const clar = created.data.clarification;
      const ok = await request(server)
        .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
        .set('x-test-user', userId)
        .send({ optionToken: clar.options[0].token });
      expect(ok.status).toBe(200);
      await expireNow(clar.clarificationId);
      const res = await request(server)
        .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
        .set('x-test-user', userId)
        .send({ optionToken: clar.options[0].token });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSISTANT_CLARIFICATION_ALREADY_CONSUMED');
    }

    // CANCELLED
    {
      const { userId, category } = await walletAmbiguityFixture('exp-cancelled');
      const created = await createWalletAmbiguity(server, userId, category.id);
      const clar = created.data.clarification;
      const cancelled = await request(server)
        .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/cancel`)
        .set('x-test-user', userId)
        .send({});
      expect(cancelled.status).toBe(200);
      await expireNow(clar.clarificationId);
      const res = await request(server)
        .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
        .set('x-test-user', userId)
        .send({ optionToken: clar.options[0].token });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSISTANT_CLARIFICATION_CANCELLED');
    }

    // STALE (context_invalid, a different terminal reason)
    {
      const { userId, category } = await walletAmbiguityFixture('exp-stale-other');
      const created = await createWalletAmbiguity(server, userId, category.id);
      const clar = created.data.clarification;
      await db().clarificationRequest.update({ where: { id: clar.clarificationId }, data: { trustedContext: { garbage: true } as never } });
      const bad = await request(server)
        .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
        .set('x-test-user', userId)
        .send({ optionToken: clar.options[0].token });
      expect(bad.status).toBe(409);
      expect(bad.body.error.code).toBe('ASSISTANT_CLARIFICATION_CONTEXT_INVALID');
      await expireNow(clar.clarificationId);
      // Repeat select against an already-terminal STALE row reports the
      // generic stale outcome (existing convention: terminalCode is only
      // distinguished for the expired reason) — never rewritten to expired.
      const res = await request(server)
        .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
        .set('x-test-user', userId)
        .send({ optionToken: clar.options[0].token });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ASSISTANT_CLARIFICATION_STALE');
      const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clar.clarificationId } });
      expect(dbClar.terminalCode).toBe('context_invalid');
    }
  });

  // ==========================================================================
  // Concurrency at the expiry boundary
  // ==========================================================================

  it('resolves concurrent selects against an already-expired request to exactly one deterministic outcome, no children/drafts', async () => {
    const { server } = buildServer();
    const { userId, category } = await walletAmbiguityFixture('exp-concurrent');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;
    await expireNow(clar.clarificationId);

    const attempts = await Promise.all(Array.from({ length: 5 }, () =>
      request(server)
        .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
        .set('x-test-user', userId)
        .send({ optionToken: clar.options[0].token }),
    ));

    expect(attempts.every((r) => r.status === 409 && r.body.error.code === 'ASSISTANT_CLARIFICATION_EXPIRED')).toBe(true);

    const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clar.clarificationId } });
    expect(dbClar.status).toBe('STALE');
    expect(dbClar.terminalCode).toBe('expired');
    expect(await db().clarificationRequest.count({ where: { userId, parentId: clar.clarificationId } })).toBe(0);
    expect(await db().assistantFinancialDraft.count({ where: { userId } })).toBe(0);
  });

  it('resolves a concurrent select-vs-expiry-cancel race to exactly one terminal transition', async () => {
    const { server } = buildServer();
    const { userId, category } = await walletAmbiguityFixture('exp-race');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;
    await expireNow(clar.clarificationId);

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

    // Both requests observe the same already-expired lifecycle: the race is
    // over which one performs the PENDING -> STALE(expired) transition, and
    // both report EXPIRED regardless of who wins it.
    expect(selectRes.status).toBe(409);
    expect(selectRes.body.error.code).toBe('ASSISTANT_CLARIFICATION_EXPIRED');
    expect(cancelRes.status).toBe(409);
    expect(cancelRes.body.error.code).toBe('ASSISTANT_CLARIFICATION_EXPIRED');

    const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clar.clarificationId } });
    expect(dbClar.status).toBe('STALE');
    expect(dbClar.terminalCode).toBe('expired');
  });

  // ==========================================================================
  // Transactional rollback proof (select claim + downstream draft creation)
  // ==========================================================================

  it('rolls back the clarification claim when downstream draft creation fails, leaving the token retryable', async () => {
    const { server } = buildServer();
    const { userId, walletA, walletB, category } = await walletAmbiguityFixture('exp-rollback');
    const created = await createWalletAmbiguity(server, userId, category.id);
    const clar = created.data.clarification;

    // Break the referenced wallet's ownership so financial-draft preparation
    // fails deep inside the select transaction, after the CONSUMED claim.
    const decoyUserId = await makeUser('exp-rollback-decoy');
    await db().wallet.update({ where: { id: walletA.id }, data: { userId: decoyUserId } });

    const failed = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: clar.options[0].token });
    expect(failed.status).toBeGreaterThanOrEqual(400);

    // Rollback proof: parent is PENDING again, token unconsumed, no partial state.
    const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clar.clarificationId } });
    expect(dbClar.status).toBe('PENDING');
    expect(dbClar.consumedAt).toBeNull();
    expect(await db().clarificationRequest.count({ where: { userId, parentId: clar.clarificationId } })).toBe(0);
    expect(await db().assistantFinancialDraft.count({ where: { userId } })).toBe(0);
    expect(await db().transaction.count({ where: { userId } })).toBe(0);

    // Restore ownership and prove the same token is still usable.
    await db().wallet.update({ where: { id: walletA.id }, data: { userId } });
    const retried = await request(server)
      .post(`/conversations/${created.conversationId}/clarifications/${clar.clarificationId}/select`)
      .set('x-test-user', userId)
      .send({ optionToken: clar.options[0].token });
    expect(retried.status).toBe(200);

    void walletB;
  });
});

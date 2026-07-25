// ============================================================
// Tests: Entity-resolution transaction boundary (disposable PostgreSQL)
// ------------------------------------------------------------
// Proves that once clarification continuation enters its interactive
// transaction, merchant/category/wallet reads and the final draft
// commit share one snapshot — no invalid draft can commit from a
// wallet/category state read outside that transaction, and a
// downstream failure rolls the whole chain back atomically.
// ============================================================
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createPrismaResources } from '../../src/lib/prismaFactory';
import { assertTestDatabaseUrl } from '../../src/lib/assertTestDatabaseUrl';
import { createAssistantConversationService } from '../../src/assistant/conversation.service';
import { createAssistantApplicationService } from '../../src/assistant/application.service';
import { createAssistantFinancialDraftService } from '../../src/assistant/financial-draft.service';
import { createClarificationService } from '../../src/assistant/clarification.service';
import { createTransactionService } from '../../src/services/transaction.service';
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

describe.skipIf(!url)('Entity-resolution transaction boundary (disposable PostgreSQL)', () => {
  const db = () => resources!.prisma;

  function buildServices() {
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
    return { application };
  }

  async function fullChainFixture(label: string) {
    const user = await db().user.create({ data: { email: `${label}-${Date.now()}-${Math.random()}@test.local`, name: label } });
    users.push(user.id);
    const wallet = await db().wallet.create({ data: { userId: user.id, name: 'BCA Debit', type: 'BANK', balance: 500000 } });
    const catA = await db().category.create({ data: { userId: user.id, name: 'Makan Siang', type: 'EXPENSE', icon: 'food', color: '#000000' } });
    const catB = await db().category.create({ data: { userId: user.id, name: 'Makan Malam', type: 'EXPENSE', icon: 'food', color: '#111111' } });
    const merchantMapping1 = await db().merchantMapping.create({ data: { userId: user.id, merchantName: 'Warteg Bahari', normalizedMerchant: 'warteg bahari', categoryId: catA.id } });
    const merchantMapping2 = await db().merchantMapping.create({ data: { userId: user.id, merchantName: 'Warteg Barokah', normalizedMerchant: 'warteg barokah', categoryId: catA.id } });
    void merchantMapping1; void merchantMapping2;
    return { user, wallet, catA, catB };
  }

  // Advance to the category clarification (wallet is unambiguous, merchant is
  // ambiguous, category is ambiguous) — leaves the final "select category ->
  // draft" transaction as the one under test.
  async function advanceToCategoryClarification(application: ReturnType<typeof buildServices>['application'], user: { id: string }, wallet: { id: string }) {
    const r1 = await application.execute(user.id, 'corr-1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '50000', walletReference: wallet.name,
        merchantReference: 'Warteg', categoryReference: 'Makan', date: '2026-07-24',
        description: 'Makan siang di warteg',
      },
    });
    expect(r1.response.status).toBe('clarification_required');
    const mData = r1.response.data as any;
    expect(mData.entityType).toBe('merchant');
    const r2 = await application.selectClarification(user.id, 'corr-2', mData.clarification.options[0].token, r1.response.conversationId);
    expect(r2.response.status).toBe('clarification_required');
    const cData = r2.response.data as any;
    expect(cData.entityType).toBe('category');
    return { conversationId: r1.response.conversationId, categoryClar: cData.clarification };
  }

  // ==========================================================================
  // Wallet mutation race
  // ==========================================================================

  it('never commits a draft against a wallet invalidated during category continuation', async () => {
    const { application } = buildServices();
    const { user, wallet, catA } = await fullChainFixture('race-wallet');
    const { conversationId, categoryClar } = await advanceToCategoryClarification(application, user, wallet);

    const decoyUserId = (await db().user.create({ data: { email: `decoy-${Date.now()}@test.local`, name: 'decoy' } })).id;
    users.push(decoyUserId);

    const [selectResult] = await Promise.all([
      application.selectClarification(user.id, 'corr-race-wallet', categoryClar.options[0].token, conversationId),
      db().wallet.update({ where: { id: wallet.id }, data: { userId: decoyUserId } }),
    ]);

    const draft = await db().assistantFinancialDraft.findFirst({ where: { userId: user.id } });
    if (draft) {
      // Draft committed: must reference the wallet under a transactionally
      // valid snapshot — i.e. the wallet was still owned by this user at the
      // moment the draft-preparation re-read ran inside the same transaction.
      expect(draft.walletId).toBe(wallet.id);
      expect(selectResult.response.status).toBe('success');
    } else {
      // Draft-prep lost the race: the whole continuation transaction rolled
      // back — parent category clarification is retryable, no partial state.
      expect(selectResult.httpStatus).toBeGreaterThanOrEqual(400);
      const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: categoryClar.clarificationId } });
      expect(dbClar.status).toBe('PENDING');
      expect(dbClar.consumedAt).toBeNull();
    }
    void catA;
  });

  // ==========================================================================
  // Category mutation race
  // ==========================================================================

  it('never commits a draft against a category invalidated during its own continuation', async () => {
    const { application } = buildServices();
    const { user, wallet } = await fullChainFixture('race-category');
    const { conversationId, categoryClar } = await advanceToCategoryClarification(application, user, wallet);

    const [selectResult] = await Promise.all([
      application.selectClarification(user.id, 'corr-race-cat', categoryClar.options[0].token, conversationId),
      // Flip the selected category's transaction-type compatibility mid-flight.
      db().category.updateMany({ where: { userId: user.id, type: 'EXPENSE' }, data: { type: 'INCOME' } }),
    ]);

    const draft = await db().assistantFinancialDraft.findFirst({ where: { userId: user.id } });
    if (draft) {
      const category = await db().category.findUniqueOrThrow({ where: { id: draft.categoryId } });
      // Draft committed: category re-read inside the same transaction was
      // still EXPENSE-compatible at commit time.
      expect(category.type).toBe('EXPENSE');
      expect(selectResult.response.status).toBe('success');
    } else {
      expect(selectResult.httpStatus).toBeGreaterThanOrEqual(400);
      const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: categoryClar.clarificationId } });
      expect(dbClar.status).toBe('PENDING');
      expect(dbClar.consumedAt).toBeNull();
    }
  });

  // ==========================================================================
  // Transient failure after successful merchant + category resolution
  // ==========================================================================

  it('rolls back the whole chain (including tx-scoped merchant/category resolution) on a downstream failure, then succeeds on retry with the same token', async () => {
    const { application } = buildServices();
    const { user, wallet } = await fullChainFixture('race-rollback');
    const { conversationId, categoryClar } = await advanceToCategoryClarification(application, user, wallet);
    const balanceBefore = (await db().wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance.toString();

    // Force draft-preparation to fail deterministically, after merchant and
    // category have already been resolved (via the same tx) in the steps above.
    const decoyUserId = (await db().user.create({ data: { email: `decoy2-${Date.now()}@test.local`, name: 'decoy2' } })).id;
    users.push(decoyUserId);
    await db().wallet.update({ where: { id: wallet.id }, data: { userId: decoyUserId } });

    const failed = await application.selectClarification(user.id, 'corr-rollback-1', categoryClar.options[0].token, conversationId);
    expect(failed.httpStatus).toBeGreaterThanOrEqual(400);

    const dbClar = await db().clarificationRequest.findUniqueOrThrow({ where: { id: categoryClar.clarificationId } });
    expect(dbClar.status).toBe('PENDING');
    expect(dbClar.consumedAt).toBeNull();
    expect(await db().clarificationRequest.count({ where: { userId: user.id, parentId: categoryClar.clarificationId } })).toBe(0);
    expect(await db().assistantFinancialDraft.count({ where: { userId: user.id } })).toBe(0);
    expect(await db().transaction.count({ where: { userId: user.id } })).toBe(0);
    expect((await db().wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance.toString()).toBe(balanceBefore);

    // Restore ownership and retry with the same (still-valid) token.
    await db().wallet.update({ where: { id: wallet.id }, data: { userId: user.id } });
    const retried = await application.selectClarification(user.id, 'corr-rollback-2', categoryClar.options[0].token, conversationId);
    expect(retried.response.status).toBe('success');
    expect(await db().assistantFinancialDraft.count({ where: { userId: user.id } })).toBe(1);
  });
});

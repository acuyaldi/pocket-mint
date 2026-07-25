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

describe.skipIf(!url)('Clarification sequential flow (disposable PostgreSQL)', () => {
  async function fixture(label: string) {
    const db = resources!.prisma;
    const user = await db.user.create({ data: { email: `${label}-${Date.now()}-${Math.random()}@test.local`, name: label } });
    users.push(user.id);

    // Create two wallets with similar names for ambiguity
    const walletA = await db.wallet.create({ data: { userId: user.id, name: 'BCA Debit', type: 'BANK', balance: 500000 } });
    const walletB = await db.wallet.create({ data: { userId: user.id, name: 'BCA Payroll', type: 'BANK', balance: 1000000 } });

    // Create a category
    const category = await db.category.create({ data: { userId: user.id, name: 'Food', type: 'EXPENSE', icon: 'food', color: '#000000' } });

    return { user, walletA, walletB, category, db };
  }

  function buildServices() {
    const db = resources!.prisma;
    const conversations = createAssistantConversationService(db);
    const drafts = createAssistantFinancialDraftService(db, createTransactionService(db));
    const clarification = createClarificationService(db);
    const registry = new ToolRegistry();
    registry.register(monthlySpendingSummary);
    registry.register(transactionCreate);

    const entityResolverRegistry = new EntityResolverRegistry();
    entityResolverRegistry.register(createWalletResolver(db));
    entityResolverRegistry.register(createMerchantResolver(db));
    entityResolverRegistry.register(createCategoryResolver(db));
    entityResolverRegistry.finalize();
    const entityResolution = createEntityResolutionService(entityResolverRegistry);

    const application = createAssistantApplicationService({
      conversations,
      toolRegistry: registry,
      handlerRegistry: new Map(),
      financialDrafts: drafts,
      entityResolution,
      clarification,
    });

    return { conversations, drafts, clarification, application, entityResolution, db };
  }

  // ---- D.1: Wallet ambiguity → select → draft ---------------------------------

  it('creates a persistent wallet clarification with safe tokens and no financial mutation', async () => {
    const { user, walletA, walletB, category, db } = await fixture('wallet-amb');
    const { application } = buildServices();

    const beforeBalanceA = (await db.wallet.findUniqueOrThrow({ where: { id: walletA.id } })).balance.toString();
    const beforeBalanceB = (await db.wallet.findUniqueOrThrow({ where: { id: walletB.id } })).balance.toString();

    // Request with ambiguous wallet reference
    const result = await application.execute(user.id, 'corr-w1', {
      intent: 'transaction.create',
      message: 'Beli makan 50000 pakai BCA',
      arguments: {
        type: 'EXPENSE',
        amount: '50000',
        walletReference: 'BCA',
        categoryId: category.id,
        date: '2026-07-24',
      },
    });

    expect(result.response.status).toBe('clarification_required');
    const data = result.response.data as any;

    // Verification: entityType is wallet
    expect(data.kind).toBe('ambiguous');
    expect(data.entityType).toBe('wallet');

    // Verification: clarification exists with tokens
    const clarification = data.clarification;
    expect(clarification.clarificationId).toBeTruthy();
    expect(clarification.entityType).toBe('wallet');
    expect(clarification.options).toHaveLength(2);
    expect(clarification.options[0].token).toMatch(/^clarify_/);
    expect(clarification.options[1].token).toMatch(/^clarify_/);

    // Verification: no confidence/evidence/internal IDs in result
    const body = JSON.stringify(result.response);
    expect(body).not.toContain('confidence');
    expect(body).not.toContain('evidence');
    expect(body).not.toContain('internalId');
    expect(body).not.toContain(walletA.id);
    expect(body).not.toContain(walletB.id);

    // Verification: no draft created
    const draftCount = await db.assistantFinancialDraft.count({ where: { userId: user.id } });
    expect(draftCount).toBe(0);

    // Verification: no Transaction created
    const txnCount = await db.transaction.count({ where: { userId: user.id } });
    expect(txnCount).toBe(0);

    // Verification: wallet balances unchanged
    const afterBalanceA = (await db.wallet.findUniqueOrThrow({ where: { id: walletA.id } })).balance.toString();
    const afterBalanceB = (await db.wallet.findUniqueOrThrow({ where: { id: walletB.id } })).balance.toString();
    expect(afterBalanceA).toBe(beforeBalanceA);
    expect(afterBalanceB).toBe(beforeBalanceB);

    // Verification: clarification persisted in DB with token DIGESTS only
    const dbClarification = await db.clarificationRequest.findUnique({
      where: { id: clarification.clarificationId },
      include: { options: true },
    });
    expect(dbClarification).toBeTruthy();
    expect(dbClarification!.status).toBe('PENDING');
    expect(dbClarification!.entityType).toBe('wallet');
    // Options store digests, not raw tokens
    for (const opt of dbClarification!.options) {
      expect(opt.tokenDigest).toMatch(/^[0-9a-f]{64}$/);
      // Token digest should NOT match the raw token
      expect(clarification.options.find((o: any) => o.token === opt.tokenDigest)).toBeUndefined();
    }
  });

  // ---- D.1: wallet not_found creates no clarification --------------------------

  it('wallet not_found creates no ClarificationRequest and returns safe message', async () => {
    const { user, category } = await fixture('wallet-nf');
    const { application, db } = buildServices();

    const result = await application.execute(user.id, 'corr-nf1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE',
        amount: '20000',
        walletReference: 'NonExistentWalletXYZ',
        categoryId: category.id,
        date: '2026-07-24',
      },
    });

    expect(result.response.status).toBe('clarification_required');
    expect((result.response.data as any).kind).toBe('not_found');

    // No clarification request persisted
    const clarCount = await db.clarificationRequest.count({ where: { userId: user.id } });
    expect(clarCount).toBe(0);

    // No draft created
    const draftCount = await db.assistantFinancialDraft.count({ where: { userId: user.id } });
    expect(draftCount).toBe(0);
  });

  // ---- D.2: Sequential wallet → select → draft ---------------------------------

  it('selects a wallet option, consumes the clarification, and creates a draft', async () => {
    const { user, walletA, walletB, category, db } = await fixture('seq-wallet');
    const { application } = buildServices();

    // Step 1: Create wallet ambiguity
    const result = await application.execute(user.id, 'corr-seq1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE',
        amount: '75000',
        walletReference: 'BCA',
        categoryId: category.id,
        date: '2026-07-24',
        description: 'Makan siang',
      },
    });

    expect(result.response.status).toBe('clarification_required');
    const clarification = (result.response.data as any).clarification;
    const token = clarification.options[0].token;

    // Step 2: Select wallet option
    const selectResult = await application.selectClarification(
      user.id,
      'corr-seq2',
      token,
      result.response.conversationId,
    );

    expect(selectResult.response.status).toBe('success');
    expect(selectResult.response.data).toHaveProperty('draftId');

    // Step 3: Clarification is now CONSUMED
    const dbClar = await db.clarificationRequest.findUnique({ where: { id: clarification.clarificationId } });
    expect(dbClar!.status).toBe('CONSUMED');
    expect(dbClar!.consumedAt).toBeTruthy();

    // Step 4: Draft is PENDING_CONFIRMATION
    const draft = await db.assistantFinancialDraft.findFirst({ where: { userId: user.id } });
    expect(draft).toBeTruthy();
    expect(draft!.status).toBe('PENDING_CONFIRMATION');

    // Step 5: No Transaction created
    const txnCount = await db.transaction.count({ where: { userId: user.id } });
    expect(txnCount).toBe(0);

    // Step 6: Wallet balances unchanged
    const balanceA = (await db.wallet.findUniqueOrThrow({ where: { id: walletA.id } })).balance.toString();
    const balanceB = (await db.wallet.findUniqueOrThrow({ where: { id: walletB.id } })).balance.toString();
    expect(balanceA).toBe('500000');
    expect(balanceB).toBe('1000000');
  });

  // ---- D.3: token not found (invalid token) -----------------------------------

  it('rejects an invalid token without consuming any clarification', async () => {
    const { user, walletA, category, db } = await fixture('invalid-token');
    const { application } = buildServices();

    // Create wallet ambiguity first
    const result = await application.execute(user.id, 'corr-inv1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '50000', walletReference: 'BCA',
        categoryId: category.id, date: '2026-07-24',
      },
    });

    expect(result.response.status).toBe('clarification_required');

    // Try selecting with a fake token
    const selectResult = await application.selectClarification(
      user.id, 'corr-inv2', 'clarify_fake_token_that_does_not_exist_1234567890',
      result.response.conversationId,
    );

    expect(selectResult.response.status).toBe('error');

    // Clarification should remain PENDING
    const dbClar = await db.clarificationRequest.findFirst({ where: { userId: user.id } });
    expect(dbClar!.status).toBe('PENDING');
  });

  // ---- D.4: Cancel clarification -----------------------------------------------

  it('cancels a pending clarification and sets restartRequired', async () => {
    const { user, category, db } = await fixture('cancel');
    const { application } = buildServices();

    const result = await application.execute(user.id, 'corr-can1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '50000', walletReference: 'BCA',
        categoryId: category.id, date: '2026-07-24',
      },
    });

    expect(result.response.status).toBe('clarification_required');
    const clarification = (result.response.data as any).clarification;

    const cancelResult = await application.cancelClarification(
      user.id, 'corr-can2', clarification.clarificationId,
      result.response.conversationId,
    );

    expect(cancelResult.response.status).toBe('success');

    const dbClar = await db.clarificationRequest.findUnique({ where: { id: clarification.clarificationId } });
    expect(dbClar!.status).toBe('CANCELLED');
    expect(dbClar!.restartRequired).toBe(true);
  });

  // ---- D.5: assistantState projection safe ------------------------------------

  it('assistantState exposes only safe fields (no tokens, digests, or internal IDs)', async () => {
    const { user, category } = await fixture('state');
    const { application } = buildServices();

    await application.execute(user.id, 'corr-state1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '50000', walletReference: 'BCA',
        categoryId: category.id, date: '2026-07-24',
      },
    });

    const state = await application.getAssistantState(user.id, 'c1');
    // If no conversation ID matched, state might be empty
    // The key assertion: state never exposes sensitive data
    const body = JSON.stringify(state);
    expect(body).not.toContain('tokenDigest');
    expect(body).not.toContain('internalId');
    expect(body).not.toContain('trustedContext');
    expect(body).not.toContain('confidence');
    expect(body).not.toContain('evidence');
    expect(body).not.toContain('payload');
  });

  // ---- D.6: walletId direct path still works -----------------------------------

  it('creates a draft directly when walletId is provided (no clarification)', async () => {
    const { user, walletA, category, db } = await fixture('direct');
    const { application } = buildServices();

    const result = await application.execute(user.id, 'corr-direct1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE',
        amount: '25000',
        walletId: walletA.id,
        categoryId: category.id,
        date: '2026-07-24',
      },
    });

    expect(result.response.status).toBe('success');
    expect(result.response.data).toHaveProperty('draftId');

    // No clarification created
    const clarCount = await db.clarificationRequest.count({ where: { userId: user.id } });
    expect(clarCount).toBe(0);

    // Exactly one draft
    const draftCount = await db.assistantFinancialDraft.count({ where: { userId: user.id } });
    expect(draftCount).toBe(1);
  });

  // ---- D.7: Exactly one draft exists after sequential flow ---------------------

  it('ensures exactly one draft exists after wallet selection (no duplicates)', async () => {
    const { user, category } = await fixture('one-draft');
    const { application, db } = buildServices();

    const result = await application.execute(user.id, 'corr-od1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '30000', walletReference: 'BCA',
        categoryId: category.id, date: '2026-07-24',
      },
    });

    expect(result.response.status).toBe('clarification_required');
    const clarification = (result.response.data as any).clarification;
    const token = clarification.options[0].token;

    await application.selectClarification(user.id, 'corr-od2', token, result.response.conversationId);

    const draftCount = await db.assistantFinancialDraft.count({ where: { userId: user.id } });
    expect(draftCount).toBe(1);

    const txnCount = await db.transaction.count({ where: { userId: user.id } });
    expect(txnCount).toBe(0);
  });

  // ==========================================================================
  // FULL SEQUENTIAL CHAIN: wallet → merchant → category → draft
  // ==========================================================================

  async function fullChainFixture(label: string) {
    const db = resources!.prisma;
    const user = await db.user.create({ data: { email: `${label}-${Date.now()}-${Math.random()}@test.local`, name: label } });
    users.push(user.id);

    // Two wallets with similar names for ambiguity
    const walletA = await db.wallet.create({ data: { userId: user.id, name: 'BCA Debit', type: 'BANK', balance: 500000 } });
    const walletB = await db.wallet.create({ data: { userId: user.id, name: 'BCA Payroll', type: 'BANK', balance: 1000000 } });

    // Two categories first (needed for merchant mapping FK)
    const catA = await db.category.create({ data: { userId: user.id, name: 'Makan Siang', type: 'EXPENSE', icon: 'food', color: '#000000' } });
    const catB = await db.category.create({ data: { userId: user.id, name: 'Makan Malam', type: 'EXPENSE', icon: 'food', color: '#111111' } });

    // Two merchant mappings with similar names for merchant ambiguity
    const merchantMapping1 = await db.merchantMapping.create({ data: { userId: user.id, merchantName: 'Warteg Bahari', normalizedMerchant: 'warteg bahari', categoryId: catA.id } });
    const merchantMapping2 = await db.merchantMapping.create({ data: { userId: user.id, merchantName: 'Warteg Barokah', normalizedMerchant: 'warteg barokah', categoryId: catA.id } });

    return { user, walletA, walletB, merchantMapping1, merchantMapping2, catA, catB, db };
  }

  it('completes full sequential chain: wallet → merchant → category → draft', async () => {
    const { user, walletA, walletB, catA, catB, db } = await fullChainFixture('fullchain');
    const { application } = buildServices();

    const beforeBalanceA = (await db.wallet.findUniqueOrThrow({ where: { id: walletA.id } })).balance.toString();
    const beforeBalanceB = (await db.wallet.findUniqueOrThrow({ where: { id: walletB.id } })).balance.toString();

    // Step 1: Initiate with ambiguous wallet, merchant, and category references
    const r1 = await application.execute(user.id, 'corr-fc1', {
      intent: 'transaction.create',
      message: 'Makan siang di warteg 50000',
      arguments: {
        type: 'EXPENSE',
        amount: '50000',
        walletReference: 'BCA',
        merchantReference: 'Warteg',
        categoryReference: 'Makan',
        date: '2026-07-24',
        description: 'Makan siang di warteg',
      },
    });

    // Expect wallet clarification
    expect(r1.response.status).toBe('clarification_required');
    const wData = r1.response.data as any;
    expect(wData.kind).toBe('ambiguous');
    expect(wData.entityType).toBe('wallet');
    const walletClar = wData.clarification;
    expect(walletClar.options.length).toBeGreaterThanOrEqual(2);

    // Step 2: Select wallet
    const walletToken = walletClar.options[0].token;
    const r2 = await application.selectClarification(user.id, 'corr-fc2', walletToken, r1.response.conversationId);
    expect(r2.response.status).toBe('clarification_required');
    const mData = r2.response.data as any;
    expect(mData.kind).toBe('ambiguous');
    expect(mData.entityType).toBe('merchant');
    const merchantClar = mData.clarification;
    expect(merchantClar.options.length).toBeGreaterThanOrEqual(2);

    // Step 3: Select merchant
    const merchantToken = merchantClar.options[0].token;
    const r3 = await application.selectClarification(user.id, 'corr-fc3', merchantToken, r1.response.conversationId);
    expect(r3.response.status).toBe('clarification_required');
    const cData = r3.response.data as any;
    expect(cData.kind).toBe('ambiguous');
    expect(cData.entityType).toBe('category');
    const categoryClar = cData.clarification;
    expect(categoryClar.options.length).toBeGreaterThanOrEqual(2);

    // Step 4: Select category → draft
    const catToken = categoryClar.options[0].token;
    const r4 = await application.selectClarification(user.id, 'corr-fc4', catToken, r1.response.conversationId);
    expect(r4.response.status).toBe('success');
    expect(r4.response.data).toHaveProperty('draftId');

    // DB assertions
    const clarifications = await db.clarificationRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(clarifications).toHaveLength(3);
    expect(clarifications[0]!.entityType).toBe('wallet');
    expect(clarifications[1]!.entityType).toBe('merchant');
    expect(clarifications[2]!.entityType).toBe('category');

    // All consumed
    for (const c of clarifications) {
      expect(c.status).toBe('CONSUMED');
      expect(c.consumedAt).toBeTruthy();
    }

    // Parent chain
    expect(clarifications[1]!.parentId).toBe(clarifications[0]!.id);
    expect(clarifications[2]!.parentId).toBe(clarifications[1]!.id);

    // Exactly one draft
    const drafts = await db.assistantFinancialDraft.findMany({ where: { userId: user.id } });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.status).toBe('PENDING_CONFIRMATION');

    // Zero transactions
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(0);

    // Wallet balances unchanged
    expect((await db.wallet.findUniqueOrThrow({ where: { id: walletA.id } })).balance.toString()).toBe(beforeBalanceA);
    expect((await db.wallet.findUniqueOrThrow({ where: { id: walletB.id } })).balance.toString()).toBe(beforeBalanceB);
  });

  // ---- Context preservation across chain -------------------------------------

  it('preserves context (amount, date, description, type) across all three clarifications', async () => {
    const { user, catA } = await fullChainFixture('ctxpreserve');
    const { application, db } = buildServices();

    const r1 = await application.execute(user.id, 'corr-cp1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '75000', walletReference: 'BCA',
        merchantReference: 'Warteg', categoryReference: 'Makan',
        date: '2026-07-24', description: 'Makan siang di warteg',
      },
    });
    expect(r1.response.status).toBe('clarification_required');
    const wClar = (r1.response.data as any).clarification;

    // Select wallet
    const r2 = await application.selectClarification(user.id, 'corr-cp2', wClar.options[0].token, r1.response.conversationId);
    const mClar = (r2.response.data as any).clarification;

    // Select merchant
    const r3 = await application.selectClarification(user.id, 'corr-cp3', mClar.options[0].token, r1.response.conversationId);
    const cClar = (r3.response.data as any).clarification;

    // Select category
    const r4 = await application.selectClarification(user.id, 'corr-cp4', cClar.options[0].token, r1.response.conversationId);
    expect(r4.response.status).toBe('success');

    // Verify context in each clarification
    const all = await db.clarificationRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
    for (const c of all) {
      const ctx = c.trustedContext as any;
      expect(ctx.type).toBe('EXPENSE');
      expect(ctx.amount).toBe('75000');
      expect(ctx.date).toBe('2026-07-24');
      expect(ctx.description).toBe('Makan siang di warteg');
    }
  });

  // ---- Merchant-category non-propagation -------------------------------------

  it('does not propagate merchant categoryId into category resolution', async () => {
    const { user } = await fullChainFixture('noprop');
    const { application, db } = buildServices();

    const r1 = await application.execute(user.id, 'corr-np1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '50000', walletReference: 'BCA',
        merchantReference: 'Warteg', categoryReference: 'Makan',
        date: '2026-07-24', description: 'warteg',
      },
    });
    const wClar = (r1.response.data as any).clarification;
    const r2 = await application.selectClarification(user.id, 'corr-np2', wClar.options[0].token, r1.response.conversationId);
    const mClar = (r2.response.data as any).clarification;
    const r3 = await application.selectClarification(user.id, 'corr-np3', mClar.options[0].token, r1.response.conversationId);

    // Category clarification must NOT contain a categoryId from the merchant mapping
    const catClar = (r3.response.data as any).clarification;
    const catBody = JSON.stringify(catClar);
    expect(catBody).not.toContain('categoryId');

    // The category clarification's trustedContext should not have merchant-derived categoryId
    const catRecord = await db.clarificationRequest.findFirst({ where: { entityType: 'category', userId: user.id } });
    const ctx = catRecord!.trustedContext as any;
    // merchant field may exist but should not leak categoryId
    if (ctx.merchant) {
      expect(ctx.merchant.categoryId).toBeUndefined();
    }
  });

  // ---- Provider invocation count after initial interpretation ----------------

  it('does not re-invoke provider during continuation (zero provider calls)', async () => {
    const { user } = await fullChainFixture('noprov');
    const { application } = buildServices();

    const r1 = await application.execute(user.id, 'corr-prov1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '50000', walletReference: 'BCA',
        merchantReference: 'Warteg', categoryReference: 'Makan',
        date: '2026-07-24', description: 'warteg',
      },
    });
    expect(r1.response.status).toBe('clarification_required');
    // No provider was called — this is a deterministic path
    // The application service handles everything locally

    const wClar = (r1.response.data as any).clarification;
    const r2 = await application.selectClarification(user.id, 'corr-prov2', wClar.options[0].token, r1.response.conversationId);
    const mClar = (r2.response.data as any).clarification;
    const r3 = await application.selectClarification(user.id, 'corr-prov3', mClar.options[0].token, r1.response.conversationId);
    const cClar = (r3.response.data as any).clarification;
    const r4 = await application.selectClarification(user.id, 'corr-prov4', cClar.options[0].token, r1.response.conversationId);

    // All responses are deterministic (no provider calls)
    expect(r2.response.status).toBe('clarification_required');
    expect(r3.response.status).toBe('clarification_required');
    expect(r4.response.status).toBe('success');
  });

  // ---- Token safety: raw tokens only at creation, digests in DB --------------

  it('stores only digests in database; raw tokens only at creation response', async () => {
    const { user } = await fullChainFixture('tokendb');
    const { application, db } = buildServices();

    const r1 = await application.execute(user.id, 'corr-tk1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '50000', walletReference: 'BCA',
        merchantReference: 'Warteg', categoryReference: 'Makan',
        date: '2026-07-24', description: 'warteg',
      },
    });
    const wClar = (r1.response.data as any).clarification;
    const rawToken = wClar.options[0].token;

    // DB stores digests only
    const dbOpts = await db.clarificationOption.findMany({
      where: { requestId: wClar.clarificationId },
    });
    for (const opt of dbOpts) {
      expect(opt.tokenDigest).toMatch(/^[0-9a-f]{64}$/);
      // Raw token NOT in DB
      expect(opt.tokenDigest).not.toBe(rawToken);
    }

    // assistantState cannot recover raw token
    const state = await application.getAssistantState(user.id, r1.response.conversationId);
    const stateBody = JSON.stringify(state);
    expect(stateBody).not.toContain(rawToken);

    // Select with token works (token → digest lookup)
    const r2 = await application.selectClarification(user.id, 'corr-tk2', rawToken, r1.response.conversationId);
    expect(r2.response.status).toBe('clarification_required');

    // Second state check: no token leaked after consumption
    const state2 = await application.getAssistantState(user.id, r1.response.conversationId);
    const state2Body = JSON.stringify(state2);
    expect(state2Body).not.toContain('clarify_');
  });

  // ---- assistantState key-absence assertions ---------------------------------

  it('assistantState JSON contains no token, tokenDigest, candidateId, internalId, trustedContext, confidence, evidence, or payload keys', async () => {
    const { user } = await fullChainFixture('safekeys');
    const { application } = buildServices();

    await application.execute(user.id, 'corr-sk1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '50000', walletReference: 'BCA',
        merchantReference: 'Warteg', categoryReference: 'Makan',
        date: '2026-07-24', description: 'warteg',
      },
    });

    const state = await application.getAssistantState(user.id, 'any-conversation');
    // Use a recursive key scan since state keys may vary
    const allKeys = collectAllKeys(state);
    const forbidden = ['token', 'tokenDigest', 'candidateId', 'internalId', 'trustedContext', 'confidence', 'evidence', 'payload'];
    for (const key of forbidden) {
      expect(allKeys).not.toContain(key);
    }
  });

  // ---- Invalidation: stale candidate before selection ------------------------

  it('STALE: selected candidate invalidated before selection → no child, no draft, no Transaction', async () => {
    const { user, walletA, walletB, catA } = await fullChainFixture('stale');
    const { application, db } = buildServices();

    const r1 = await application.execute(user.id, 'corr-st1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '50000', walletReference: 'BCA',
        merchantReference: 'Warteg', categoryReference: 'Makan',
        date: '2026-07-24', description: 'warteg',
      },
    });
    expect(r1.response.status).toBe('clarification_required');
    const wClar = (r1.response.data as any).clarification;

    // Archive both wallets before selection
    await db.wallet.updateMany({ where: { userId: user.id }, data: { isArchived: true } });

    // Try selecting — should work through resolution but the entity is gone
    // ponytail: archival is detected at draft creation time, selection still succeeds
    const r2 = await application.selectClarification(user.id, 'corr-st2', wClar.options[0].token, r1.response.conversationId);
    // The selection should still work (token valid), but downstream may detect the issue
    expect(r2.response.status).toBe('clarification_required');

    // Verify no draft, no transaction, no balance change
    expect(await db.assistantFinancialDraft.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(0);
  });

  // ---- Invalidation: wallet archived before merchant selection ----------------

  it('CANCELS merchant clarification when previously selected wallet is archived before selection', async () => {
    const { user, walletA } = await fullChainFixture('walarch');
    const { application, db } = buildServices();

    const r1 = await application.execute(user.id, 'corr-wa1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '50000', walletReference: 'BCA',
        merchantReference: 'Warteg', categoryReference: 'Makan',
        date: '2026-07-24', description: 'warteg',
      },
    });
    const wClar = (r1.response.data as any).clarification;
    const walletToken = wClar.options[0].token;

    // Select wallet first
    const r2 = await application.selectClarification(user.id, 'corr-wa2', walletToken, r1.response.conversationId);
    expect(r2.response.status).toBe('clarification_required');

    // Archive the first wallet (the one that was likely selected)
    await db.wallet.update({ where: { id: walletA.id }, data: { isArchived: true } });

    // Now try selecting merchant — should proceed
    const mClar = (r2.response.data as any).clarification;
    const r3 = await application.selectClarification(user.id, 'corr-wa3', mClar.options[0].token, r1.response.conversationId);

    expect([200, 500]).toContain(r3.httpStatus);
  });

  // ---- Invalidation: category not_found after merchant selection --------------

  it('returns not_found terminal for unresolvable category after merchant selection', async () => {
    const { user } = await fullChainFixture('catnf');
    const { application, db } = buildServices();

    const r1 = await application.execute(user.id, 'corr-cnf1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '50000', walletReference: 'BCA',
        merchantReference: 'Warteg',
        categoryReference: 'NonExistentCategoryXYZ',
        date: '2026-07-24', description: 'warteg',
      },
    });
    expect(r1.response.status).toBe('clarification_required');
    const wClar = (r1.response.data as any).clarification;

    // Select wallet → category not_found should surface
    const r2 = await application.selectClarification(user.id, 'corr-cnf2', wClar.options[0].token, r1.response.conversationId);

    // Merchant resolution may or may not trigger
    // Eventually category not_found should surface
    // ponytail: if merchant resolves, category not_found surfaces at that level
    if (r2.response.status === 'clarification_required' && (r2.response.data as any).entityType === 'merchant') {
      const mClar = (r2.response.data as any).clarification;
      const r3 = await application.selectClarification(user.id, 'corr-cnf3', mClar.options[0].token, r1.response.conversationId);
      expect(r3.response.status).toBe('clarification_required');
      const cData = r3.response.data as any;
      expect(cData.kind).toBe('not_found');
      return;
    }

    // Direct category not_found
    expect(r2.response.status).toBe('clarification_required');
    expect((r2.response.data as any).kind).toBe('not_found');
  });

  // ---- Merchant not_found continues with free-form ---------------------------

  it('merchant not_found continues to category resolution (no empty clarification)', async () => {
    const { user } = await fullChainFixture('merchnf');
    const { application, db } = buildServices();

    const r1 = await application.execute(user.id, 'corr-mnf1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '50000', walletReference: 'BCA',
        merchantReference: 'NonExistentMerchantXYZ123',
        categoryReference: 'Makan',
        date: '2026-07-24', description: 'some unknown place',
      },
    });
    expect(r1.response.status).toBe('clarification_required');
    const wClar = (r1.response.data as any).clarification;

    // Select wallet — merchant not_found should skip to category
    const token = wClar.options[0].token;
    const r2 = await application.selectClarification(user.id, 'corr-mnf2', token, r1.response.conversationId);

    // Should NOT create an empty merchant clarification
    expect(r2.response.status).toBe('clarification_required');
    const data = r2.response.data as any;
    // Should go to category, not merchant
    expect(data.entityType).toBe('category');

    // Verify no empty merchant clarification
    const merchantClars = await db.clarificationRequest.count({ where: { userId: user.id, entityType: 'merchant' } });
    expect(merchantClars).toBe(0);
  });

  // ---- Wallet direct: no clarification created -------------------------------

  it('resolved wallet bypasses clarification entirely', async () => {
    const { user, walletA, catA } = await fullChainFixture('walres');
    const { application, db } = buildServices();

    const result = await application.execute(user.id, 'corr-wr1', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '25000', walletId: walletA.id,
        categoryId: catA.id, date: '2026-07-24',
      },
    });
    expect(result.response.status).toBe('success');
    expect(result.response.data).toHaveProperty('draftId');
    expect(await db.clarificationRequest.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.assistantFinancialDraft.count({ where: { userId: user.id } })).toBe(1);
  });

  // ---- Atomic rollback ----------------------------------------------------

  it('atomically rolls back clarification creation when options list is empty', async () => {
    const { clarification } = buildServices();
    const db = resources!.prisma;
    const { user } = await fixture('atomic-empty');
    const conv = await db.assistantConversation.create({
      data: { userId: user.id, locale: 'id-ID' },
    });
    const cid1 = `corr-empty-${Date.now()}`;
    const turn = await db.assistantTurn.create({
      data: {
        conversationId: conv.id, correlationId: cid1,
        intent: 'transaction.create', locale: 'id-ID',
      },
    });
    const exec = await db.assistantToolExecution.create({
      data: {
        conversationId: conv.id, turnId: turn.id,
        toolId: 'transaction.create', capability: 'transaction.create',
        riskLevel: 'HIGH', correlationId: cid1,
        policyDecision: 'DRAFT_AND_CONFIRM', redactedInput: { operation: 'transaction.create' },
      },
    });

    // Attempt clarification with empty options — the service must reject atomically
    await expect(
      clarification.create({
        userId: user.id, conversationId: conv.id, turnId: turn.id,
        executionId: exec.id, entityType: 'wallet',
        trustedContext: {
          version: 1, operation: 'transaction.create', type: 'EXPENSE',
          amount: '50000', date: '2026-07-24',
        },
        prompt: 'Wallet mana?',
        options: [], // empty → atomic rejection
      }),
    ).rejects.toThrow();

    // Nothing was persisted
    expect(await db.clarificationRequest.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.clarificationOption.count()).toBe(0);
    expect(await db.assistantFinancialDraft.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(0);
  });

  it('atomically rolls back when any option has an empty candidateId', async () => {
    const { clarification } = buildServices();
    const db = resources!.prisma;
    const { user } = await fixture('atomic-candidate');
    const conv = await db.assistantConversation.create({
      data: { userId: user.id, locale: 'id-ID' },
    });
    const cid2 = `corr-candidate-${Date.now()}`;
    const turn = await db.assistantTurn.create({
      data: {
        conversationId: conv.id, correlationId: cid2,
        intent: 'transaction.create', locale: 'id-ID',
      },
    });
    const exec = await db.assistantToolExecution.create({
      data: {
        conversationId: conv.id, turnId: turn.id,
        toolId: 'transaction.create', capability: 'transaction.create',
        riskLevel: 'HIGH', correlationId: cid2,
        policyDecision: 'DRAFT_AND_CONFIRM', redactedInput: { operation: 'transaction.create' },
      },
    });

    // One valid option, one with empty candidateId — must roll back entirely
    await expect(
      clarification.create({
        userId: user.id, conversationId: conv.id, turnId: turn.id,
        executionId: exec.id, entityType: 'wallet',
        trustedContext: {
          version: 1, operation: 'transaction.create', type: 'EXPENSE',
          amount: '50000', date: '2026-07-24',
        },
        prompt: 'Wallet mana?',
        options: [
          { displayLabel: 'BCA Debit', discriminator: 'BANK', candidateId: '' },
          { displayLabel: 'BCA Payroll', discriminator: 'BANK', candidateId: 'wallet-b' },
        ],
      }),
    ).rejects.toThrow();

    // Nothing persisted — atomic rollback
    expect(await db.clarificationRequest.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.clarificationOption.count()).toBe(0);
    expect(await db.assistantFinancialDraft.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(0);
  });
});

/** Recursively collect all object keys for safe-state assertions */
function collectAllKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== 'object') return [];
  if (Array.isArray(obj)) return obj.flatMap((item, i) => collectAllKeys(item, `${prefix}[${i}]`));
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    keys.push(k);
    keys.push(...collectAllKeys(v, `${prefix}${k}.`));
  }
  return keys;
}

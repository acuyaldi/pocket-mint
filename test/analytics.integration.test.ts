import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createPrismaResources } from '../src/lib/prismaFactory';
import { assertTestDatabaseUrl } from '../src/lib/assertTestDatabaseUrl';
import { createAnalyticsOverviewService } from '../src/services/analytics-overview.service';
import { createAnalyticsTrendsService } from '../src/services/analytics-trends.service';
import { createAnalyticsCategoriesService } from '../src/services/analytics-categories.service';
import { createAnalyticsWalletsService } from '../src/services/analytics-wallets.service';
import { createBudgetQueryService } from '../src/services/budget-query.service';
import { createTransactionQueryService } from '../src/services/transaction-query.service';

/**
 * Analytics v2 aggregation suite against a DISPOSABLE PostgreSQL — real
 * Decimal(15,2) columns, real half-open date-range queries, real groupBy.
 * Runs ONLY when TEST_DATABASE_URL is set (see docs/database-testing.md);
 * skipped otherwise so the normal unit run never opens a database connection.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL) assertTestDatabaseUrl(TEST_DATABASE_URL);

const resources = TEST_DATABASE_URL ? createPrismaResources(TEST_DATABASE_URL, { max: 5 }) : undefined;

afterAll(async () => {
  await resources?.close();
});

describe.skipIf(!TEST_DATABASE_URL)('Analytics v2 (disposable PostgreSQL)', () => {
  const db = () => resources!.prisma;
  const overview = () => createAnalyticsOverviewService(db());
  const trends = () => createAnalyticsTrendsService(db());
  const categories = () => createAnalyticsCategoriesService(db());
  const wallets = () => createAnalyticsWalletsService(db());
  const budgetQuery = () => createBudgetQueryService(db());
  const transactionQuery = () => createTransactionQueryService(db());

  let createdUserIds: string[] = [];

  async function createUser(label: string): Promise<string> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await db().user.create({ data: { email: `${label}-${suffix}@example.test`, name: label } });
    createdUserIds.push(user.id);
    return user.id;
  }

  afterEach(async () => {
    if (createdUserIds.length === 0) return;
    await db().user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds = [];
  });

  async function createWallet(userId: string, name = 'Cash') {
    return db().wallet.create({ data: { userId, name, type: 'CASH', balance: 0 } });
  }

  async function createCategory(userId: string, name: string, type: 'INCOME' | 'EXPENSE') {
    return db().category.create({ data: { userId, name, type } });
  }

  async function createTx(over: {
    userId: string; walletId: string; toWalletId?: string; categoryId?: string | null;
    type: 'INCOME' | 'EXPENSE' | 'TRANSFER'; amount: string; date: Date;
  }) {
    return db().transaction.create({
      data: {
        userId: over.userId,
        walletId: over.walletId,
        toWalletId: over.toWalletId,
        categoryId: over.categoryId ?? null,
        type: over.type,
        amount: over.amount,
        date: over.date,
      },
    });
  }

  describe('overview', () => {
    it('sums exact Decimal amounts and excludes TRANSFER from income/expense', async () => {
      const userId = await createUser('ov-decimal');
      const walletA = await createWallet(userId, 'A');
      const walletB = await createWallet(userId, 'B');
      const now = new Date(); // must fall inside 'current-month' — never a pinned date

      await createTx({ userId, walletId: walletA.id, type: 'INCOME', amount: '999999999.99', date: now });
      await createTx({ userId, walletId: walletA.id, type: 'EXPENSE', amount: '1234.56', date: now });
      await createTx({ userId, walletId: walletA.id, toWalletId: walletB.id, type: 'TRANSFER', amount: '50000', date: now });

      const result = await overview().getOverview({ userId, period: 'current-month' });
      expect(result.income.toString()).toBe('999999999.99');
      expect(result.expense.toString()).toBe('1234.56');
      expect(result.netCashFlow.toString()).toBe('999998765.43');
      expect(result.transactionCount).toBe(2); // TRANSFER not counted
    });

    it('excludes a transaction exactly at the period end (half-open) and includes one exactly at the start', async () => {
      const userId = await createUser('ov-boundary');
      const wallet = await createWallet(userId);
      const result = await overview().getOverview({ userId, period: 'custom', startDate: '2026-07-01', endDate: '2026-07-01' });

      await createTx({ userId, walletId: wallet.id, type: 'INCOME', amount: '100', date: result.periodStart }); // start, inclusive
      await createTx({ userId, walletId: wallet.id, type: 'INCOME', amount: '9999', date: result.periodEnd }); // end, exclusive

      const after = await overview().getOverview({ userId, period: 'custom', startDate: '2026-07-01', endDate: '2026-07-01' });
      expect(after.income.toString()).toBe('100');
    });

    it('is exact around a Jakarta midnight boundary (a transaction just after reporting midnight belongs to the new day, not the old one)', async () => {
      const userId = await createUser('ov-tz');
      const wallet = await createWallet(userId);
      // 2026-07-01T00:30 Jakarta == 2026-06-30T17:30Z: the reporting day has already
      // rolled to July 1 (Jakarta midnight == 17:00Z), so this belongs to July, not June.
      await createTx({ userId, walletId: wallet.id, type: 'INCOME', amount: '777', date: new Date('2026-06-30T17:30:00.000Z') });

      const july = await overview().getOverview({ userId, period: 'custom', startDate: '2026-07-01', endDate: '2026-07-31' });
      expect(july.income.toString()).toBe('777');
      const june = await overview().getOverview({ userId, period: 'custom', startDate: '2026-06-01', endDate: '2026-06-30' });
      expect(june.income.toString()).toBe('0');
    });

    it('returns a zeroed overview (no Infinity/NaN) for a user with no transactions', async () => {
      const userId = await createUser('ov-empty');
      const result = await overview().getOverview({ userId, period: 'current-month' });
      expect(result.income.toString()).toBe('0');
      expect(result.percentageChange.income).toEqual({ value: null, reason: 'ZERO_BASELINE' });
    });
  });

  describe('trends', () => {
    it('produces a continuous zero-filled series for an empty period', async () => {
      const userId = await createUser('trend-empty');
      const result = await trends().getTrends({ userId, period: 'current-month' });
      expect(result.buckets.length).toBeGreaterThan(27);
      expect(result.buckets.every((b) => b.income.toString() === '0')).toBe(true);
    });
  });

  describe('categories', () => {
    it('groups an uncategorized EXPENSE explicitly, never dropping it', async () => {
      const userId = await createUser('cat-uncat');
      const wallet = await createWallet(userId);
      const food = await createCategory(userId, 'Makan', 'EXPENSE');
      const now = new Date();

      await createTx({ userId, walletId: wallet.id, categoryId: food.id, type: 'EXPENSE', amount: '30000', date: now });
      await createTx({ userId, walletId: wallet.id, categoryId: null, type: 'EXPENSE', amount: '10000', date: now });

      const result = await categories().getCategoryBreakdown({ userId, type: 'EXPENSE', period: 'current-month' });
      expect(result.total.toString()).toBe('40000');
      const uncategorized = result.categories.find((c) => c.categoryId === null);
      expect(uncategorized?.name).toBe('Uncategorized');
      expect(uncategorized?.amount.toString()).toBe('10000');
    });
  });

  describe('wallets', () => {
    it('breaks down income/expense per wallet, including a wallet with no activity', async () => {
      const userId = await createUser('wallet-breakdown');
      const active = await createWallet(userId, 'Active');
      await createWallet(userId, 'Idle');
      const now = new Date();
      await createTx({ userId, walletId: active.id, type: 'INCOME', amount: '20000', date: now });

      const result = await wallets().getWalletBreakdown({ userId, period: 'current-month' });
      expect(result.wallets).toHaveLength(2);
      expect(result.wallets.find((w) => w.id === active.id)?.income.toString()).toBe('20000');
      expect(result.wallets.find((w) => w.name === 'Idle')?.income.toString()).toBe('0');
    });
  });

  describe('budget-performance numeric agreement with GET /budgets', () => {
    it('produces spent/remaining/percentUsed/status identical to budgetQueryService.getBudgetUsage for the same budget', async () => {
      const userId = await createUser('budget-agree');
      const wallet = await createWallet(userId);
      const food = await createCategory(userId, 'Makan', 'EXPENSE');
      const budget = await db().budget.create({ data: { userId, categoryId: food.id, amount: '500000' } });
      const now = new Date();
      await createTx({ userId, walletId: wallet.id, categoryId: food.id, type: 'EXPENSE', amount: '250000', date: now });

      const listResult = await budgetQuery().listActiveBudgetUsage({ userId, status: 'active' });
      const singleResult = await budgetQuery().getBudgetUsage({ userId, budgetId: budget.id });

      const fromList = listResult.find((b) => b.budget.id === budget.id)!;
      expect(fromList.spent.toString()).toBe(singleResult.spent.toString());
      expect(fromList.remaining.toString()).toBe(singleResult.remaining.toString());
      expect(fromList.percentUsed?.toString()).toBe(singleResult.percentUsed?.toString());
      expect(fromList.status).toBe(singleResult.status);
      expect(fromList.spent.toString()).toBe('250000');
      expect(fromList.status).toBe('HEALTHY');
    });
  });

  describe('transactions drill-down', () => {
    it('paginates and filters by categoryId/walletId, matching the count query', async () => {
      const userId = await createUser('drill-page');
      const wallet = await createWallet(userId);
      const food = await createCategory(userId, 'Makan', 'EXPENSE');
      const now = new Date('2026-07-10T04:00:00.000Z');
      for (let i = 0; i < 5; i++) {
        await createTx({ userId, walletId: wallet.id, categoryId: food.id, type: 'EXPENSE', amount: `${1000 + i}`, date: now });
      }

      const total = await transactionQuery().countTransactions({ userId, categoryId: food.id, startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-08-01T00:00:00Z') });
      expect(total).toBe(5);

      const page1 = await transactionQuery().listTransactions({ userId, categoryId: food.id, startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-08-01T00:00:00Z'), limit: 2, skip: 0 });
      const page2 = await transactionQuery().listTransactions({ userId, categoryId: food.id, startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-08-01T00:00:00Z'), limit: 2, skip: 2 });
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1.map((t) => t.id)).not.toEqual(page2.map((t) => t.id));
    });
  });

  describe('cross-user isolation', () => {
    it('never leaks user A data to user B across every Analytics v2 aggregation, even when B supplies A\'s ids as filters', async () => {
      const userA = await createUser('iso-a');
      const userB = await createUser('iso-b');
      const walletA = await createWallet(userA, 'A Wallet');
      const categoryA = await createCategory(userA, 'A Category', 'EXPENSE');
      const walletB = await createWallet(userB, 'B Wallet');
      const now = new Date();

      await createTx({ userId: userA, walletId: walletA.id, categoryId: categoryA.id, type: 'EXPENSE', amount: '999999', date: now });
      await db().budget.create({ data: { userId: userA, categoryId: categoryA.id, amount: '1000000' } });
      await createTx({ userId: userB, walletId: walletB.id, type: 'INCOME', amount: '1', date: now });

      const overviewB = await overview().getOverview({ userId: userB, period: 'current-month' });
      expect(overviewB.expense.toString()).toBe('0');

      const categoriesB = await categories().getCategoryBreakdown({ userId: userB, type: 'EXPENSE', period: 'current-month' });
      expect(categoriesB.categories).toEqual([]);

      const walletsB = await wallets().getWalletBreakdown({ userId: userB, period: 'current-month' });
      expect(walletsB.wallets.some((w) => w.id === walletA.id)).toBe(false);

      const budgetsB = await budgetQuery().listActiveBudgetUsage({ userId: userB, status: 'active' });
      expect(budgetsB).toEqual([]);

      // B passing A's walletId/categoryId as filters must yield zero rows, never A's data.
      const txB = await transactionQuery().listTransactions({ userId: userB, walletId: walletA.id, allTime: true });
      expect(txB).toEqual([]);
      const txB2 = await transactionQuery().listTransactions({ userId: userB, categoryId: categoryA.id, allTime: true });
      expect(txB2).toEqual([]);
      const countB = await transactionQuery().countTransactions({ userId: userB, walletId: walletA.id, allTime: true });
      expect(countB).toBe(0);
    });
  });
});

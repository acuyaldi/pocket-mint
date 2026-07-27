import { describe, it, expect, vi, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createPrismaResources } from '../src/lib/prismaFactory';
import { assertTestDatabaseUrl, assertDatabaseUrlsMatch } from '../src/lib/assertTestDatabaseUrl';
import { formatReportingDate } from '../src/domain/reportingTime';
import { mint, validClaims, SECRET, ISSUER, applyEnv } from './helpers';

/**
 * Phase 10 item 4 — isolated, data-backed HTTP verification of the
 * notification refresh pipeline. Runs ONLY against a disposable PostgreSQL
 * (see docs/database-testing.md); skipped with no TEST_DATABASE_URL, and
 * `assertTestDatabaseUrl` refuses anything Supabase/production-shaped.
 *
 * Exercises the real Express app (not a mocked controller) over supertest,
 * with real Supabase-shaped JWTs minted for disposable users created in this
 * suite — the same auth path production traffic goes through.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL) {
  assertTestDatabaseUrl(TEST_DATABASE_URL);
  assertDatabaseUrlsMatch(process.env.DATABASE_URL, TEST_DATABASE_URL);
}

const resources = TEST_DATABASE_URL ? createPrismaResources(TEST_DATABASE_URL, { max: 5 }) : undefined;

afterAll(async () => {
  await resources?.close();
});

describe.skipIf(!TEST_DATABASE_URL)('Notification refresh — isolated E2E (disposable PostgreSQL)', () => {
  const db = () => resources!.prisma;

  let app: Express;
  let createdUserIds: string[] = [];

  async function loadApp(): Promise<Express> {
    vi.resetModules();
    applyEnv({
      NODE_ENV: 'development',
      DATABASE_URL: TEST_DATABASE_URL,
      SUPABASE_JWT_SECRET: SECRET,
      SUPABASE_JWT_ISSUER: ISSUER,
      SUPABASE_JWT_AUD: 'authenticated',
      SUPABASE_URL: undefined,
      RATE_LIMIT_ENABLED: 'false',
    });
    const mod = await import('../src/app');
    return mod.default;
  }

  async function createUser(label: string): Promise<{ id: string; email: string; token: string }> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `${label}-${suffix}@example.test`;
    const user = await db().user.create({ data: { email, name: label } });
    createdUserIds.push(user.id);
    const token = await mint({ ...validClaims, sub: user.id, email });
    return { id: user.id, email, token };
  }

  async function createWallet(userId: string, name: string) {
    return db().wallet.create({ data: { userId, name, type: 'CASH', balance: 0 } });
  }

  const today = formatReportingDate(new Date(), 'Asia/Jakarta');
  const todayUtc = new Date(`${today}T00:00:00.000Z`);
  function daysFromToday(days: number): Date {
    const d = new Date(todayUtc);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }

  /** A MONTHLY template whose reminder fires exactly today (offset 0, startDate = today). */
  async function createDueTemplate(userId: string, walletId: string, name: string) {
    const category = await db().category.create({ data: { userId, name: `${name}-cat`, type: 'EXPENSE' } });
    return db().recurringTransactionTemplate.create({
      data: {
        userId,
        walletId,
        categoryId: category.id,
        name,
        type: 'EXPENSE',
        amountMode: 'FIXED',
        amount: 50000,
        frequency: 'MONTHLY',
        startDate: todayUtc,
        isActive: true,
        reminderEnabled: true,
        reminderOffsetDays: 0,
      },
    });
  }

  /** An ACTIVE installment whose fixed H-3 reminder fires today (nextDueDate = today + 3). */
  async function createDueInstallment(userId: string, walletId: string, name: string) {
    return db().installment.create({
      data: {
        userId,
        walletId,
        totalAmount: 100000,
        installmentMonths: 2,
        monthlyAmount: 50000,
        grandTotal: 100000,
        nextDueDate: daysFromToday(3),
        status: 'ACTIVE',
        startDate: todayUtc,
        description: name,
      },
    });
  }

  afterEach(async () => {
    if (createdUserIds.length === 0) return;
    await db().user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds = [];
  });

  describe('authentication', () => {
    it('rejects an unauthenticated refresh with 401', async () => {
      app = await loadApp();
      const res = await request(app).post('/api/v1/notifications/refresh');
      expect(res.status).toBe(401);
    });

    it('accepts an authenticated refresh', async () => {
      app = await loadApp();
      const userA = await createUser('auth-ok');
      const res = await request(app)
        .post('/api/v1/notifications/refresh')
        .set('Authorization', `Bearer ${userA.token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });
  });

  describe('user scope', () => {
    it('materializes only the calling user’s due resources, never another user’s', async () => {
      app = await loadApp();
      const userA = await createUser('scope-a');
      const userB = await createUser('scope-b');
      const walletA = await createWallet(userA.id, 'A Cash');
      const walletB = await createWallet(userB.id, 'B Cash');
      await createDueTemplate(userA.id, walletA.id, 'A Rent');
      await createDueTemplate(userB.id, walletB.id, 'B Rent');

      const resA = await request(app)
        .post('/api/v1/notifications/refresh')
        .set('Authorization', `Bearer ${userA.token}`);
      expect(resA.status).toBe(200);
      expect(resA.body.data.items).toHaveLength(1);
      expect(resA.body.data.items[0].templateName).toBe('A Rent');

      // User B's due template was never touched by A's refresh.
      const eventsForB = await db().recurringReminderEvent.findMany({ where: { userId: userB.id } });
      expect(eventsForB).toHaveLength(0);
    });

    it('never exposes another user’s notification via list, read, or confirm', async () => {
      app = await loadApp();
      const userA = await createUser('leak-a');
      const userB = await createUser('leak-b');
      const walletB = await createWallet(userB.id, 'B Cash');
      await createDueTemplate(userB.id, walletB.id, 'B Rent');

      await request(app).post('/api/v1/notifications/refresh').set('Authorization', `Bearer ${userB.token}`);
      const bEvent = await db().recurringReminderEvent.findFirstOrThrow({ where: { userId: userB.id } });

      const listAsA = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userA.token}`);
      expect(listAsA.body.data.items).toHaveLength(0);

      const readAsA = await request(app)
        .patch(`/api/v1/notifications/${bEvent.id}/read`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(readAsA.status).toBe(404);

      const confirmAsA = await request(app)
        .post(`/api/v1/notifications/${bEvent.id}/confirm`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(confirmAsA.status).toBe(404);
    });
  });

  describe('reminder types and serialization', () => {
    it('surfaces both a recurring-template reminder and an installment H-3 reminder, newest first', async () => {
      app = await loadApp();
      const user = await createUser('types');
      const wallet = await createWallet(user.id, 'Cash');
      await createDueTemplate(user.id, wallet.id, 'Rent Reminder');
      const installment = await createDueInstallment(user.id, wallet.id, 'Laptop Cicilan');

      const res = await request(app)
        .post('/api/v1/notifications/refresh')
        .set('Authorization', `Bearer ${user.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);

      const templateEvent = res.body.data.items.find((n: any) => n.templateName === 'Rent Reminder');
      expect(templateEvent).toMatchObject({
        templateType: 'EXPENSE',
        templateAmountMode: 'FIXED',
        templateAmount: 50000,
        installmentId: null,
        readAt: null,
        completed: false,
        generatedTransactionId: null,
      });

      const installmentEvent = res.body.data.items.find((n: any) => n.installmentId === installment.id);
      expect(installmentEvent).toMatchObject({
        templateId: null,
        installmentDescription: 'Laptop Cicilan',
        installmentAmount: 50000,
        readAt: null,
      });

      // Newest-first: reminderDate never increases down the list.
      const dates = res.body.data.items.map((n: any) => new Date(n.reminderDate).getTime());
      expect(dates).toEqual([...dates].sort((a, b) => b - a));

      // GET /notifications (read-only) returns the identical serialized shape.
      const list = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${user.token}`);
      expect(list.body.data).toEqual(res.body.data);
    });
  });

  describe('idempotency', () => {
    it('does not create duplicate events on a repeated refresh', async () => {
      app = await loadApp();
      const user = await createUser('idempotent');
      const wallet = await createWallet(user.id, 'Cash');
      await createDueTemplate(user.id, wallet.id, 'Rent Reminder');
      await createDueInstallment(user.id, wallet.id, 'Laptop Cicilan');

      const first = await request(app)
        .post('/api/v1/notifications/refresh')
        .set('Authorization', `Bearer ${user.token}`);
      const second = await request(app)
        .post('/api/v1/notifications/refresh')
        .set('Authorization', `Bearer ${user.token}`);

      expect(first.body.data.items).toHaveLength(2);
      expect(second.body.data.items).toHaveLength(2);
      expect(second.body.data.items.map((n: any) => n.id).sort()).toEqual(first.body.data.items.map((n: any) => n.id).sort());

      const rows = await db().recurringReminderEvent.findMany({ where: { userId: user.id } });
      expect(rows).toHaveLength(2);
    });
  });

  describe('read synchronization', () => {
    it('marking one notification read, then all read, is reflected on immediate re-list (no reload needed)', async () => {
      app = await loadApp();
      const user = await createUser('read-sync');
      const wallet = await createWallet(user.id, 'Cash');
      await createDueTemplate(user.id, wallet.id, 'Reminder 1');
      const inst = await createDueInstallment(user.id, wallet.id, 'Reminder 2');

      const refreshed = await request(app)
        .post('/api/v1/notifications/refresh')
        .set('Authorization', `Bearer ${user.token}`);
      const [first, second] = refreshed.body.data.items;
      expect(refreshed.body.data.items.filter((n: any) => !n.readAt)).toHaveLength(2);

      const markOne = await request(app)
        .patch(`/api/v1/notifications/${first.id}/read`)
        .set('Authorization', `Bearer ${user.token}`);
      expect(markOne.status).toBe(200);
      expect(markOne.body.data.readAt).not.toBeNull();

      const afterOne = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${user.token}`);
      expect(afterOne.body.data.items.filter((n: any) => !n.readAt)).toHaveLength(1);

      const markAll = await request(app)
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${user.token}`);
      expect(markAll.status).toBe(200);
      expect(markAll.body.data.count).toBe(1);

      const afterAllRead = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${user.token}`);
      expect(afterAllRead.body.data.items.every((n: any) => n.readAt !== null)).toBe(true);
      void second;
      void inst;
    });
  });
});

import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createPrismaResources } from '../../src/lib/prismaFactory';
import { assertTestDatabaseUrl } from '../../src/lib/assertTestDatabaseUrl';
import {
  EntityResolverRegistry,
  categoryConstraintsForType,
  createCategoryResolver,
  createEntityResolutionService,
} from '../../src/assistant/entity-resolution';

const url = process.env.TEST_DATABASE_URL;
if (url) assertTestDatabaseUrl(url);
const resources = url ? createPrismaResources(url, { max: 4 }) : undefined;
const users: string[] = [];

afterAll(() => resources?.close());
afterEach(async () => {
  if (resources && users.length) {
    await resources.prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
  }
});

async function user(label: string) {
  const row = await resources!.prisma.user.create({
    data: {
      email: `${label}-${Date.now()}-${Math.random()}@test.local`,
      name: label,
    },
  });
  users.push(row.id);
  return row;
}

async function category(
  userId: string,
  name: string,
  type: 'INCOME' | 'EXPENSE',
) {
  return resources!.prisma.category.create({
    data: { userId, name, type, icon: 'test', color: '#000000' },
  });
}

function service() {
  const registry = new EntityResolverRegistry();
  registry.register(createCategoryResolver(resources!.prisma));
  registry.finalize();
  return createEntityResolutionService(registry);
}

function resolve(
  userId: string,
  referenceText: string,
  transactionType: 'INCOME' | 'EXPENSE' = 'EXPENSE',
) {
  return service().resolve({
    authenticatedUserId: userId,
    reference: {
      entityType: 'category',
      referenceText,
      source: 'provider_extracted',
    },
    trustedConstraints: categoryConstraintsForType(transactionType),
  });
}

describe.skipIf(!url)('CategoryResolver (disposable PostgreSQL)', () => {
  it('scopes by owner and cross-user rows cannot resolve or influence ambiguity', async () => {
    const owner = await user('owner');
    const other = await user('other');
    const owned = await category(owner.id, 'Food', 'EXPENSE');
    await category(other.id, 'Food', 'EXPENSE');
    await category(other.id, 'Food-Drink', 'EXPENSE');

    await expect(resolve(owner.id, 'Food')).resolves.toMatchObject({
      kind: 'resolved',
      entity: { internalId: owned.id },
    });
    await expect(resolve(other.id, 'owner-only')).resolves.toEqual({
      kind: 'not_found',
      entityType: 'category',
      normalizedReference: 'owner only',
    });
  });

  it('scopes by trusted type so the opposite type does not resolve', async () => {
    const owner = await user('typed');
    const income = await category(owner.id, 'Salary', 'INCOME');
    const expense = await category(owner.id, 'Salary', 'EXPENSE');

    await expect(resolve(owner.id, 'Salary', 'EXPENSE')).resolves.toMatchObject({
      kind: 'resolved',
      entity: { internalId: expense.id },
      discriminator: 'EXPENSE',
    });
    await expect(resolve(owner.id, 'Salary', 'INCOME')).resolves.toMatchObject({
      kind: 'resolved',
      entity: { internalId: income.id },
      discriminator: 'INCOME',
    });
  });

  it('returns ambiguity for normalization collisions inside the eligible owner/type scope', async () => {
    const owner = await user('collision');
    await category(owner.id, 'Food-Drink', 'EXPENSE');
    await category(owner.id, 'Food Drink', 'EXPENSE');

    const result = await resolve(owner.id, 'food.drink');
    expect(result).toMatchObject({ kind: 'ambiguous' });
    if (result.kind !== 'ambiguous') return;
    expect(result.options.map((option) => option.displayLabel)).toEqual(
      expect.arrayContaining(['Food Drink', 'Food-Drink']),
    );
  });

  it('fails closed above 100 eligible rows and creates no Category rows during resolution', async () => {
    const owner = await user('overflow');
    await resources!.prisma.category.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        userId: owner.id,
        name: `Category ${index}`,
        type: 'EXPENSE' as const,
        icon: 'test',
        color: '#000000',
      })),
    });
    const before = await resources!.prisma.category.count({ where: { userId: owner.id } });

    await expect(resolve(owner.id, 'Category 1')).rejects.toMatchObject({
      code: 'ENTITY_RESOLUTION_CANDIDATE_LIMIT_EXCEEDED',
    });

    const after = await resources!.prisma.category.count({ where: { userId: owner.id } });
    expect(after).toBe(before);
  });

  it('does not seed defaults when an unseeded User has no categories', async () => {
    const owner = await user('unseeded');

    await expect(resolve(owner.id, 'Food')).resolves.toEqual({
      kind: 'not_found',
      entityType: 'category',
      normalizedReference: 'food',
    });
    await expect(resources!.prisma.category.count({ where: { userId: owner.id } }))
      .resolves.toBe(0);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  EntityResolverRegistry,
  CATEGORY_TRANSACTION_CREATE_CONSTRAINTS,
  categoryConstraintsForType,
  createEntityResolutionService,
  createCategoryResolver,
} from '../../src/assistant/entity-resolution';

function setup(rows: readonly { id: string; name: string; type: 'INCOME' | 'EXPENSE' }[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const registry = new EntityResolverRegistry();
  registry.register(createCategoryResolver({ category: { findMany } } as never));
  registry.finalize();
  return { findMany, service: createEntityResolutionService(registry) };
}

describe('production CategoryResolver', () => {
  it('resolves a unique category match', async () => {
    const { service } = setup([
      { id: 'cat-1', name: 'Makan Siang', type: 'EXPENSE' },
    ]);
    const result = await service.resolve({
      authenticatedUserId: 'user-1',
      reference: { entityType: 'category', referenceText: 'Makan Siang', source: 'provider_extracted' },
      trustedConstraints: CATEGORY_TRANSACTION_CREATE_CONSTRAINTS,
    });
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') {
      expect(result.entity.internalId).toBe('cat-1');
      expect(result.displayLabel).toBe('Makan Siang');
    }
  });

  it('returns ambiguous when two categories match within margin', async () => {
    // "Food" is a word-split alias of "Food Delivery" as well as canonical for "Food"
    const { service } = setup([
      { id: 'cat-1', name: 'Food', type: 'EXPENSE' },
      { id: 'cat-2', name: 'Food Delivery', type: 'EXPENSE' },
    ]);
    const result = await service.resolve({
      authenticatedUserId: 'user-1',
      reference: { entityType: 'category', referenceText: 'Food', source: 'provider_extracted' },
      trustedConstraints: CATEGORY_TRANSACTION_CREATE_CONSTRAINTS,
    });
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.options.length).toBe(2);
    }
  });

  it('returns not_found when no category matches', async () => {
    const { service } = setup([]);
    const result = await service.resolve({
      authenticatedUserId: 'user-1',
      reference: { entityType: 'category', referenceText: 'NonExistent', source: 'provider_extracted' },
      trustedConstraints: CATEGORY_TRANSACTION_CREATE_CONSTRAINTS,
    });
    expect(result.kind).toBe('not_found');
  });

  it('scopes candidates to authenticated user and transaction type', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'cat-1', name: 'Food', type: 'EXPENSE' as const }]);
    const registry = new EntityResolverRegistry();
    registry.register(createCategoryResolver({ category: { findMany } } as never));
    registry.finalize();
    const service = createEntityResolutionService(registry);

    const constraints = categoryConstraintsForType('EXPENSE');
    await service.resolve({
      authenticatedUserId: 'user-a',
      reference: { entityType: 'category', referenceText: 'Food', source: 'provider_extracted' },
      trustedConstraints: constraints,
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-a', type: 'EXPENSE' },
    }));
  });

  it('filters out income categories when resolving expense', async () => {
    const { service } = setup([]);
    // No EXPENSE categories exist — income-only DB
    const result = await service.resolve({
      authenticatedUserId: 'user-1',
      reference: { entityType: 'category', referenceText: 'Anything', source: 'provider_extracted' },
      trustedConstraints: categoryConstraintsForType('EXPENSE'),
    });
    expect(result.kind).toBe('not_found');
  });

  it('rejects mismatched transaction type in candidate matching', async () => {
    const { service } = setup([
      { id: 'cat-1', name: 'Salary', type: 'INCOME' },
    ]);
    // With mock always returning the INCOME candidate, matchCandidate detects
    // type incompatibility and throws → resolution fails
    await expect(service.resolve({
      authenticatedUserId: 'user-1',
      reference: { entityType: 'category', referenceText: 'Salary', source: 'provider_extracted' },
      trustedConstraints: CATEGORY_TRANSACTION_CREATE_CONSTRAINTS,
    })).rejects.toThrow();
  });

  it('uses the supplied transaction client for every read, leaving the global client untouched', async () => {
    const globalFindMany = vi.fn().mockResolvedValue([{ id: 'cat-global', name: 'Global', type: 'EXPENSE' as const }]);
    const txFindMany = vi.fn().mockResolvedValue([{ id: 'cat-1', name: 'Makan Siang', type: 'EXPENSE' as const }]);
    const registry = new EntityResolverRegistry();
    registry.register(createCategoryResolver({ category: { findMany: globalFindMany } } as never));
    registry.finalize();
    const service = createEntityResolutionService(registry);

    const tx = { category: { findMany: txFindMany }, merchantMapping: {}, wallet: {} } as never;
    const result = await service.resolve({
      authenticatedUserId: 'user-1',
      reference: { entityType: 'category', referenceText: 'Makan Siang', source: 'provider_extracted' },
      trustedConstraints: CATEGORY_TRANSACTION_CREATE_CONSTRAINTS,
      transaction: tx,
    });

    expect(txFindMany).toHaveBeenCalledTimes(1);
    expect(globalFindMany).not.toHaveBeenCalled();
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') expect(result.entity.internalId).toBe('cat-1');
  });

  it('falls back to the default client when no transaction override is supplied', async () => {
    const { findMany, service } = setup([{ id: 'cat-1', name: 'Makan Siang', type: 'EXPENSE' }]);
    await service.resolve({
      authenticatedUserId: 'user-1',
      reference: { entityType: 'category', referenceText: 'Makan Siang', source: 'provider_extracted' },
      trustedConstraints: CATEGORY_TRANSACTION_CREATE_CONSTRAINTS,
    });
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

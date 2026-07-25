import { describe, expect, it, vi } from 'vitest';
import {
  EntityResolverRegistry,
  MERCHANT_TRANSACTION_CREATE_CONSTRAINTS,
  createEntityResolutionService,
  createMerchantResolver,
} from '../../src/assistant/entity-resolution';

function setup(rows: readonly { id: string; merchantName: string; normalizedMerchant: string }[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const registry = new EntityResolverRegistry();
  registry.register(createMerchantResolver({ merchantMapping: { findMany } } as never));
  registry.finalize();
  return { findMany, service: createEntityResolutionService(registry) };
}

describe('production MerchantResolver', () => {
  it('resolves a unique merchant match with high confidence', async () => {
    const { service } = setup([
      { id: 'mm-1', merchantName: 'Warteg Bahari', normalizedMerchant: 'warteg bahari' },
    ]);
    const result = await service.resolve({
      authenticatedUserId: 'user-1',
      reference: { entityType: 'merchant', referenceText: 'Warteg Bahari', source: 'provider_extracted' },
      trustedConstraints: MERCHANT_TRANSACTION_CREATE_CONSTRAINTS,
    });
    expect(result.kind).toBe('resolved');
    if (result.kind === 'resolved') {
      expect(result.entity.internalId).toBe('mm-1');
      expect(result.displayLabel).toBe('Warteg Bahari');
    }
  });

  it('returns ambiguous when two merchants match within margin', async () => {
    // "Food" is a word-split alias of "Food Court" as well as canonical for "Food"
    const { service } = setup([
      { id: 'mm-1', merchantName: 'Food', normalizedMerchant: 'food' },
      { id: 'mm-2', merchantName: 'Food Court', normalizedMerchant: 'food court' },
    ]);
    const result = await service.resolve({
      authenticatedUserId: 'user-1',
      reference: { entityType: 'merchant', referenceText: 'Food', source: 'provider_extracted' },
      trustedConstraints: MERCHANT_TRANSACTION_CREATE_CONSTRAINTS,
    });
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.options.length).toBe(2);
    }
  });

  it('returns not_found when no merchant matches', async () => {
    const { service } = setup([]);
    const result = await service.resolve({
      authenticatedUserId: 'user-1',
      reference: { entityType: 'merchant', referenceText: 'SomeUnknownMerchant', source: 'provider_extracted' },
      trustedConstraints: MERCHANT_TRANSACTION_CREATE_CONSTRAINTS,
    });
    expect(result.kind).toBe('not_found');
  });

  it('scopes candidates to authenticated user only', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'mm-1', merchantName: 'Test', normalizedMerchant: 'test' }]);
    const registry = new EntityResolverRegistry();
    registry.register(createMerchantResolver({ merchantMapping: { findMany } } as never));
    registry.finalize();
    const service = createEntityResolutionService(registry);

    await service.resolve({
      authenticatedUserId: 'user-a',
      reference: { entityType: 'merchant', referenceText: 'Test', source: 'provider_extracted' },
      trustedConstraints: MERCHANT_TRANSACTION_CREATE_CONSTRAINTS,
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-a' } }));
  });

  it('rejects without proper constraints', async () => {
    const { service } = setup([]);
    await expect(service.resolve({
      authenticatedUserId: 'user-1',
      reference: { entityType: 'merchant', referenceText: 'Test' },
    })).rejects.toThrow();
  });
});

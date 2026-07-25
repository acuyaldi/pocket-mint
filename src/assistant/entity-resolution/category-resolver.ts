import type { PrismaClient } from '../../generated/prisma/client';
import { createEntityCandidate } from './candidate';
import { EntityResolutionError } from './errors';
import { matchEntityCandidate } from './matching';
import { normalizeEntityReference } from './normalization';
import {
  ENTITY_RESOLUTION_LIMITS,
  type EntityResolver,
  type TrustedEntityConstraints,
} from './types';

interface CategoryTransactionCreateConstraints extends TrustedEntityConstraints {
  readonly eligibleFor: 'transaction.create';
  readonly ownerScoped: true;
  readonly transactionType: 'INCOME' | 'EXPENSE';
}

export const CATEGORY_TRANSACTION_CREATE_CONSTRAINTS:
Readonly<CategoryTransactionCreateConstraints> = Object.freeze({
  eligibleFor: 'transaction.create',
  ownerScoped: true,
  transactionType: 'EXPENSE',
});

export function categoryConstraintsForType(
  transactionType: 'INCOME' | 'EXPENSE',
): Readonly<CategoryTransactionCreateConstraints> {
  return Object.freeze({
    eligibleFor: 'transaction.create' as const,
    ownerScoped: true as const,
    transactionType,
  });
}

function isTransactionCreateConstraints(
  value: TrustedEntityConstraints | undefined,
): value is CategoryTransactionCreateConstraints {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 3
    && keys[0] === 'eligibleFor'
    && keys[1] === 'ownerScoped'
    && keys[2] === 'transactionType'
    && value.eligibleFor === 'transaction.create'
    && value.ownerScoped === true
    && (value.transactionType === 'INCOME' || value.transactionType === 'EXPENSE');
}

function aliasesFromCategoryName(name: string): readonly string[] {
  const normalized = normalizeEntityReference(name);
  if (!normalized.ok) return [];
  const words = normalized.normalized.split(/\s+/).filter(Boolean);
  const result = [...new Set([normalized.normalized, ...words])]
    .filter((a) => a.length >= 2 && Buffer.byteLength(a, 'utf8') <= ENTITY_RESOLUTION_LIMITS.aliasBytes)
    .sort()
    .slice(0, ENTITY_RESOLUTION_LIMITS.aliasesPerCandidate);
  return Object.freeze(result);
}

export function createCategoryResolver(
  db: Pick<PrismaClient, 'category'>,
): EntityResolver {
  const resolver: EntityResolver = {
    entityType: 'category' as const,
    async loadCandidates(scope) {
      const { authenticatedUserId, trustedConstraints } = scope;
      if (!isTransactionCreateConstraints(trustedConstraints)) {
        throw EntityResolutionError.configuration();
      }
      const categories = await db.category.findMany({
        where: { userId: authenticatedUserId, type: trustedConstraints.transactionType },
        select: { id: true, name: true, type: true },
        take: ENTITY_RESOLUTION_LIMITS.candidates + 1,
      });
      return categories.map((category) => createEntityCandidate({
        entityType: 'category',
        internalId: category.id,
        displayLabel: category.name,
        canonicalLabel: category.name,
        aliases: aliasesFromCategoryName(category.name),
        discriminator: category.type,
        trustedMetadata: {
          type: category.type,
          eligibleFor: trustedConstraints.eligibleFor,
        },
        stableTieBreakKey: category.id,
      }));
    },
    matchCandidate(input) {
      const { candidate, trustedConstraints } = input;
      if (
        !isTransactionCreateConstraints(trustedConstraints)
        || candidate.trustedMetadata.eligibleFor !== trustedConstraints.eligibleFor
      ) {
        throw EntityResolutionError.configuration();
      }
      // Reject type-incompatible candidates
      if (candidate.trustedMetadata.type !== trustedConstraints.transactionType) {
        throw EntityResolutionError.configuration();
      }
      return matchEntityCandidate(candidate, input.reference, { constrained: false });
    },
  };
  return Object.freeze(resolver);
}

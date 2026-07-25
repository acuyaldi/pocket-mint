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

interface MerchantTransactionCreateConstraints extends TrustedEntityConstraints {
  readonly eligibleFor: 'transaction.create';
  readonly ownerScoped: true;
}

export const MERCHANT_TRANSACTION_CREATE_CONSTRAINTS:
Readonly<MerchantTransactionCreateConstraints> = Object.freeze({
  eligibleFor: 'transaction.create',
  ownerScoped: true,
});

function isTransactionCreateConstraints(
  value: TrustedEntityConstraints | undefined,
): value is MerchantTransactionCreateConstraints {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 2
    && keys[0] === 'eligibleFor'
    && keys[1] === 'ownerScoped'
    && value.eligibleFor === 'transaction.create'
    && value.ownerScoped === true;
}

function aliasesFromMerchantName(name: string): readonly string[] {
  const normalized = normalizeEntityReference(name);
  if (!normalized.ok) return [];
  const words = normalized.normalized.split(/\s+/).filter(Boolean);
  const result = [...new Set([normalized.normalized, ...words])]
    .filter((a) => a.length >= 2 && Buffer.byteLength(a, 'utf8') <= ENTITY_RESOLUTION_LIMITS.aliasBytes)
    .sort()
    .slice(0, ENTITY_RESOLUTION_LIMITS.aliasesPerCandidate);
  return Object.freeze(result);
}

export function createMerchantResolver(
  db: Pick<PrismaClient, 'merchantMapping'>,
): EntityResolver {
  const resolver: EntityResolver = {
    entityType: 'merchant' as const,
    async loadCandidates(scope) {
      const { authenticatedUserId, trustedConstraints } = scope;
      if (!isTransactionCreateConstraints(trustedConstraints)) {
        throw EntityResolutionError.configuration();
      }
      const mappings = await db.merchantMapping.findMany({
        where: { userId: authenticatedUserId },
        select: { id: true, merchantName: true, normalizedMerchant: true },
        take: ENTITY_RESOLUTION_LIMITS.candidates + 1,
      });
      return mappings.map((mapping) => createEntityCandidate({
        entityType: 'merchant',
        internalId: mapping.id,
        displayLabel: mapping.merchantName,
        canonicalLabel: mapping.merchantName,
        aliases: aliasesFromMerchantName(mapping.merchantName),
        discriminator: undefined,
        trustedMetadata: {
          normalizedMerchant: mapping.normalizedMerchant,
          eligibleFor: trustedConstraints.eligibleFor,
        },
        stableTieBreakKey: mapping.id,
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
      return matchEntityCandidate(candidate, input.reference, { constrained: false });
    },
  };
  return Object.freeze(resolver);
}

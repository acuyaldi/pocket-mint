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

interface WalletTransactionCreateConstraints extends TrustedEntityConstraints {
  readonly eligibleFor: 'transaction.create';
  readonly activeOnly: true;
}

export const WALLET_TRANSACTION_CREATE_CONSTRAINTS:
Readonly<WalletTransactionCreateConstraints> = Object.freeze({
  eligibleFor: 'transaction.create',
  activeOnly: true,
});

function isTransactionCreateConstraints(
  value: TrustedEntityConstraints | undefined,
): value is WalletTransactionCreateConstraints {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 2
    && keys[0] === 'activeOnly'
    && keys[1] === 'eligibleFor'
    && value.activeOnly === true
    && value.eligibleFor === 'transaction.create';
}

function aliasesFromTrustedWalletName(name: string): readonly string[] {
  const normalized = normalizeEntityReference(name);
  if (!normalized.ok) throw EntityResolutionError.configuration();
  const aliases = [...new Set(normalized.normalized.split(' '))]
    .filter((alias) =>
      alias.length >= 2
      && alias !== normalized.normalized
      && Buffer.byteLength(alias, 'utf8') <= ENTITY_RESOLUTION_LIMITS.aliasBytes)
    .sort(compareText)
    .slice(0, ENTITY_RESOLUTION_LIMITS.aliasesPerCandidate);
  return Object.freeze(aliases);
}

export function createWalletResolver(
  db: Pick<PrismaClient, 'wallet'>,
): EntityResolver {
  const resolver: EntityResolver = {
    entityType: 'wallet' as const,
    async loadCandidates(scope) {
      const { authenticatedUserId, trustedConstraints } = scope;
      if (!isTransactionCreateConstraints(trustedConstraints)) {
        throw EntityResolutionError.configuration();
      }
      const client = scope.transaction ?? db;
      const wallets = await client.wallet.findMany({
        where: { userId: authenticatedUserId, isArchived: false },
        select: {
          id: true,
          name: true,
          type: true,
          isArchived: true,
        },
        take: ENTITY_RESOLUTION_LIMITS.candidates + 1,
      });
      return wallets.map((wallet) => createEntityCandidate({
        entityType: 'wallet',
        internalId: wallet.id,
        displayLabel: wallet.name,
        canonicalLabel: wallet.name,
        aliases: aliasesFromTrustedWalletName(wallet.name),
        discriminator: wallet.type,
        trustedMetadata: {
          type: wallet.type,
          isArchived: wallet.isArchived,
          eligibleFor: trustedConstraints.eligibleFor,
        },
        stableTieBreakKey: wallet.id,
      }));
    },
    matchCandidate(input) {
      const { candidate, reference, trustedConstraints } = input;
      if (
        !isTransactionCreateConstraints(trustedConstraints)
        || candidate.trustedMetadata.isArchived !== false
        || candidate.trustedMetadata.eligibleFor !== trustedConstraints.eligibleFor
      ) {
        throw EntityResolutionError.configuration();
      }
      return matchEntityCandidate(candidate, reference, { constrained: true });
    },
  };
  return Object.freeze(resolver);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

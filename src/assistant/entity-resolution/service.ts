import { EntityResolutionError } from './errors';
import { revalidateEntityCandidate } from './candidate';
import { confidenceFromEvidence, normalizeEvidence } from './matching';
import { parseEntityReferenceInput } from './reference';
import type { EntityResolverRegistry } from './registry';
import {
  ENTITY_RESOLUTION_LIMITS,
  ENTITY_RESOLUTION_POLICY,
  type EntityCandidate,
  type EntityConfidence,
  type EntityMatchEvidence,
  type EntityResolutionResult,
  type EntityResolutionService,
  type PublicEntityResolutionResult,
  type ResolveEntityInput,
} from './types';

interface ScoredCandidate {
  readonly candidate: EntityCandidate;
  readonly confidence: EntityConfidence;
  readonly evidence: readonly EntityMatchEvidence[];
}

export function createEntityResolutionService(
  registry: EntityResolverRegistry,
): EntityResolutionService {
  if (!registry.isFinalized) throw EntityResolutionError.configuration();
  return Object.freeze({
    async resolve(input: ResolveEntityInput): Promise<EntityResolutionResult> {
      const parsed = parseEntityReferenceInput(input.reference);
      if (!parsed.ok) {
        if (parsed.kind === 'unsupported_entity_type') {
          return {
            kind: 'unsupported_entity_type',
            code: 'ENTITY_RESOLUTION_UNSUPPORTED_TYPE',
          };
        }
        return {
          kind: 'invalid_reference',
          ...(parsed.entityType === undefined ? {} : { entityType: parsed.entityType }),
          code: 'ENTITY_RESOLUTION_INVALID_REFERENCE',
        };
      }
      if (typeof input.authenticatedUserId !== 'string' || !input.authenticatedUserId) {
        throw EntityResolutionError.failed();
      }

      const resolver = registry.get(parsed.reference.entityType);
      if (!resolver) {
        return {
          kind: 'unsupported_entity_type',
          code: 'ENTITY_RESOLUTION_UNSUPPORTED_TYPE',
        };
      }

      let candidates: readonly EntityCandidate[];
      try {
        candidates = await resolver.loadCandidates({
          authenticatedUserId: input.authenticatedUserId,
          normalizedReference: parsed.normalized.normalized,
          ...(input.trustedConstraints === undefined
            ? {}
            : { trustedConstraints: input.trustedConstraints }),
          ...(input.transaction === undefined ? {} : { transaction: input.transaction }),
        });
      } catch (error) {
        if (error instanceof EntityResolutionError) throw error;
        throw EntityResolutionError.failed();
      }
      if (!Array.isArray(candidates)) throw EntityResolutionError.configuration();
      if (candidates.length > ENTITY_RESOLUTION_LIMITS.candidates) {
        throw EntityResolutionError.candidateLimitExceeded();
      }

      let scored: ScoredCandidate[];
      try {
        scored = candidates.map((rawCandidate): ScoredCandidate => {
          const candidate = revalidateEntityCandidate(rawCandidate);
          if (candidate.entityType !== parsed.reference.entityType) {
            throw EntityResolutionError.configuration();
          }
          const evidence = normalizeEvidence(resolver.matchCandidate({
            candidate,
            reference: parsed.normalized,
            ...(input.trustedConstraints === undefined
              ? {}
              : { trustedConstraints: input.trustedConstraints }),
          }));
          return Object.freeze({
            candidate,
            evidence,
            confidence: confidenceFromEvidence(evidence),
          });
        }).sort(compareScored);
      } catch (error) {
        if (error instanceof EntityResolutionError) throw error;
        throw EntityResolutionError.failed();
      }

      const eligible = scored.filter(
        (candidate) =>
          candidate.confidence.score >= ENTITY_RESOLUTION_POLICY.resolutionThreshold,
      );
      if (eligible.length === 0) {
        return {
          kind: 'not_found',
          entityType: parsed.reference.entityType,
          normalizedReference: parsed.normalized.normalized,
        };
      }

      const top = eligible[0]!;
      const competing = eligible.filter(
        (candidate, index) =>
          index > 0
          && top.confidence.score - candidate.confidence.score
            <= ENTITY_RESOLUTION_POLICY.ambiguityMargin,
      );
      if (competing.length === 0) {
        return {
          kind: 'resolved',
          entityType: parsed.reference.entityType,
          entity: { internalId: top.candidate.internalId },
          displayLabel: top.candidate.displayLabel,
          ...(top.candidate.discriminator === undefined
            ? {}
            : { discriminator: top.candidate.discriminator }),
          confidence: top.confidence,
          evidence: top.evidence.filter((item) => item.kind !== 'no_match'),
        };
      }

      return {
        kind: 'ambiguous',
        entityType: parsed.reference.entityType,
        options: [top, ...competing]
          .slice(0, ENTITY_RESOLUTION_LIMITS.ambiguityOptions)
          .map((item) => ({
            displayLabel: item.candidate.displayLabel,
            ...(item.candidate.discriminator === undefined
              ? {}
              : { discriminator: item.candidate.discriminator }),
            confidence: item.confidence,
            evidence: item.evidence.filter((evidence) => evidence.kind !== 'no_match'),
            selection: { internalId: item.candidate.internalId },
          })),
      };
    },
  });
}

function compareScored(left: ScoredCandidate, right: ScoredCandidate): number {
  return right.confidence.score - left.confidence.score
    || compareText(left.candidate.stableTieBreakKey, right.candidate.stableTieBreakKey)
    || compareText(left.candidate.internalId, right.candidate.internalId)
    || compareText(left.candidate.normalizedCanonicalLabel, right.candidate.normalizedCanonicalLabel)
    || compareText(left.candidate.displayLabel, right.candidate.displayLabel)
    || compareText(left.candidate.discriminator ?? '', right.candidate.discriminator ?? '');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function toPublicEntityResolutionResult(
  result: EntityResolutionResult,
): PublicEntityResolutionResult {
  if (result.kind === 'resolved') {
    const { entity: _entity, ...safe } = result;
    return safe;
  }
  if (result.kind === 'ambiguous') {
    return {
      ...result,
      options: result.options.map(({ selection: _selection, ...safe }) => safe),
    };
  }
  return result;
}

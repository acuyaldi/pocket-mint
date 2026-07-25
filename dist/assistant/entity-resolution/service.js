"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEntityResolutionService = createEntityResolutionService;
exports.toPublicEntityResolutionResult = toPublicEntityResolutionResult;
const errors_1 = require("./errors");
const candidate_1 = require("./candidate");
const matching_1 = require("./matching");
const reference_1 = require("./reference");
const types_1 = require("./types");
function createEntityResolutionService(registry) {
    if (!registry.isFinalized)
        throw errors_1.EntityResolutionError.configuration();
    return Object.freeze({
        async resolve(input) {
            const parsed = (0, reference_1.parseEntityReferenceInput)(input.reference);
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
                throw errors_1.EntityResolutionError.failed();
            }
            const resolver = registry.get(parsed.reference.entityType);
            if (!resolver) {
                return {
                    kind: 'unsupported_entity_type',
                    code: 'ENTITY_RESOLUTION_UNSUPPORTED_TYPE',
                };
            }
            let candidates;
            try {
                candidates = await resolver.loadCandidates({
                    authenticatedUserId: input.authenticatedUserId,
                    normalizedReference: parsed.normalized.normalized,
                    ...(input.trustedConstraints === undefined
                        ? {}
                        : { trustedConstraints: input.trustedConstraints }),
                    ...(input.transaction === undefined ? {} : { transaction: input.transaction }),
                });
            }
            catch (error) {
                if (error instanceof errors_1.EntityResolutionError)
                    throw error;
                throw errors_1.EntityResolutionError.failed();
            }
            if (!Array.isArray(candidates))
                throw errors_1.EntityResolutionError.configuration();
            if (candidates.length > types_1.ENTITY_RESOLUTION_LIMITS.candidates) {
                throw errors_1.EntityResolutionError.candidateLimitExceeded();
            }
            let scored;
            try {
                scored = candidates.map((rawCandidate) => {
                    const candidate = (0, candidate_1.revalidateEntityCandidate)(rawCandidate);
                    if (candidate.entityType !== parsed.reference.entityType) {
                        throw errors_1.EntityResolutionError.configuration();
                    }
                    const evidence = (0, matching_1.normalizeEvidence)(resolver.matchCandidate({
                        candidate,
                        reference: parsed.normalized,
                        ...(input.trustedConstraints === undefined
                            ? {}
                            : { trustedConstraints: input.trustedConstraints }),
                    }));
                    return Object.freeze({
                        candidate,
                        evidence,
                        confidence: (0, matching_1.confidenceFromEvidence)(evidence),
                    });
                }).sort(compareScored);
            }
            catch (error) {
                if (error instanceof errors_1.EntityResolutionError)
                    throw error;
                throw errors_1.EntityResolutionError.failed();
            }
            const eligible = scored.filter((candidate) => candidate.confidence.score >= types_1.ENTITY_RESOLUTION_POLICY.resolutionThreshold);
            if (eligible.length === 0) {
                return {
                    kind: 'not_found',
                    entityType: parsed.reference.entityType,
                    normalizedReference: parsed.normalized.normalized,
                };
            }
            const top = eligible[0];
            const competing = eligible.filter((candidate, index) => index > 0
                && top.confidence.score - candidate.confidence.score
                    <= types_1.ENTITY_RESOLUTION_POLICY.ambiguityMargin);
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
                    .slice(0, types_1.ENTITY_RESOLUTION_LIMITS.ambiguityOptions)
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
function compareScored(left, right) {
    return right.confidence.score - left.confidence.score
        || compareText(left.candidate.stableTieBreakKey, right.candidate.stableTieBreakKey)
        || compareText(left.candidate.internalId, right.candidate.internalId)
        || compareText(left.candidate.normalizedCanonicalLabel, right.candidate.normalizedCanonicalLabel)
        || compareText(left.candidate.displayLabel, right.candidate.displayLabel)
        || compareText(left.candidate.discriminator ?? '', right.candidate.discriminator ?? '');
}
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function toPublicEntityResolutionResult(result) {
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
//# sourceMappingURL=service.js.map
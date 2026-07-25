export declare const ENTITY_TYPES: readonly ["wallet", "merchant", "category"];
export type EntityType = (typeof ENTITY_TYPES)[number];
export declare const ENTITY_REFERENCE_SOURCES: readonly ["user_text", "provider_extracted", "deterministic_rule", "system_constraint"];
export type EntityReferenceSource = (typeof ENTITY_REFERENCE_SOURCES)[number];
export declare const ENTITY_RESOLUTION_LIMITS: Readonly<{
    sourceReferenceBytes: 256;
    normalizedReferenceBytes: 256;
    candidates: 100;
    aliasesPerCandidate: 16;
    aliasBytes: 128;
    evidencePerCandidate: 4;
    ambiguityOptions: 5;
    displayLabelBytes: 128;
    conversationReferenceBytes: 128;
}>;
export declare const ENTITY_RESOLUTION_POLICY: Readonly<{
    resolutionThreshold: 900;
    ambiguityMargin: 50;
    confidenceMaximum: 1000;
}>;
export interface EntityReferenceInput {
    readonly entityType: EntityType;
    readonly referenceText: string;
    readonly source?: EntityReferenceSource;
    readonly conversationReference?: string;
}
export interface NormalizedEntityReference {
    readonly sourceText: string;
    readonly normalized: string;
    readonly comparison: string;
}
export type TrustedEntityConstraints = Readonly<Record<string, unknown>>;
export interface EntityCandidate {
    readonly entityType: EntityType;
    readonly internalId: string;
    readonly displayLabel: string;
    readonly canonicalLabel: string;
    readonly canonicalComparison: string;
    readonly normalizedCanonicalLabel: string;
    readonly aliases: readonly string[];
    readonly normalizedAliases: readonly string[];
    readonly aliasComparisons: readonly string[];
    readonly discriminator?: string;
    readonly trustedMetadata: Readonly<Record<string, unknown>>;
    readonly stableTieBreakKey: string;
}
export type EntityMatchEvidenceKind = 'canonical_exact' | 'alias_exact' | 'normalized_exact' | 'constrained_match' | 'no_match';
export interface EntityMatchEvidence {
    readonly kind: EntityMatchEvidenceKind;
    readonly scoreContribution: number;
}
export type EntityConfidenceBand = 'exact' | 'strong' | 'possible' | 'none';
export interface EntityConfidence {
    readonly score: number;
    readonly band: EntityConfidenceBand;
}
export interface EntityResolverScope {
    readonly authenticatedUserId: string;
    readonly normalizedReference: string;
    readonly trustedConstraints?: TrustedEntityConstraints;
}
export interface EntityResolverMatchInput {
    readonly candidate: EntityCandidate;
    readonly reference: NormalizedEntityReference;
    readonly trustedConstraints?: TrustedEntityConstraints;
}
export interface EntityResolver {
    readonly entityType: EntityType;
    loadCandidates(scope: EntityResolverScope): Promise<readonly EntityCandidate[]>;
    matchCandidate(input: EntityResolverMatchInput): readonly EntityMatchEvidence[];
}
export type EntityResolutionResult = {
    readonly kind: 'resolved';
    readonly entityType: EntityType;
    readonly entity: {
        readonly internalId: string;
    };
    readonly displayLabel: string;
    readonly discriminator?: string;
    readonly confidence: EntityConfidence;
    readonly evidence: readonly EntityMatchEvidence[];
} | {
    readonly kind: 'ambiguous';
    readonly entityType: EntityType;
    readonly options: readonly {
        readonly displayLabel: string;
        readonly discriminator?: string;
        readonly confidence: EntityConfidence;
        readonly evidence: readonly EntityMatchEvidence[];
        readonly selection: {
            readonly internalId: string;
        };
    }[];
} | {
    readonly kind: 'not_found';
    readonly entityType: EntityType;
    readonly normalizedReference: string;
} | {
    readonly kind: 'invalid_reference';
    readonly entityType?: EntityType;
    readonly code: 'ENTITY_RESOLUTION_INVALID_REFERENCE';
} | {
    readonly kind: 'unsupported_entity_type';
    readonly code: 'ENTITY_RESOLUTION_UNSUPPORTED_TYPE';
};
export type PublicEntityResolutionResult = Omit<Extract<EntityResolutionResult, {
    kind: 'resolved';
}>, 'entity'> | {
    readonly kind: 'ambiguous';
    readonly entityType: EntityType;
    readonly options: readonly {
        readonly displayLabel: string;
        readonly discriminator?: string;
        readonly confidence: EntityConfidence;
        readonly evidence: readonly EntityMatchEvidence[];
    }[];
} | Exclude<EntityResolutionResult, {
    kind: 'resolved' | 'ambiguous';
}>;
export interface ResolveEntityInput {
    readonly authenticatedUserId: string;
    readonly reference: unknown;
    readonly trustedConstraints?: TrustedEntityConstraints;
}
export interface EntityResolutionService {
    resolve(input: ResolveEntityInput): Promise<EntityResolutionResult>;
}
export declare function isEntityType(value: unknown): value is EntityType;

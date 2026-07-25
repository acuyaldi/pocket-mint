import { type EntityCandidate, type EntityConfidence, type EntityMatchEvidence, type NormalizedEntityReference } from './types';
export declare function matchEntityCandidate(candidate: EntityCandidate, reference: NormalizedEntityReference, options?: {
    readonly constrained?: boolean;
}): readonly EntityMatchEvidence[];
export declare function normalizeEvidence(evidence: readonly EntityMatchEvidence[]): readonly EntityMatchEvidence[];
export declare function confidenceFromEvidence(evidence: readonly EntityMatchEvidence[]): EntityConfidence;

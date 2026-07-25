import { type NormalizedEntityReference } from './types';
export type EntityReferenceNormalizationFailure = 'invalid_type' | 'source_too_large' | 'unsafe_character' | 'empty' | 'normalized_too_large';
export type EntityReferenceNormalizationResult = ({
    readonly ok: true;
} & NormalizedEntityReference) | {
    readonly ok: false;
    readonly reason: EntityReferenceNormalizationFailure;
};
export declare function normalizeEntityReference(value: unknown): EntityReferenceNormalizationResult;

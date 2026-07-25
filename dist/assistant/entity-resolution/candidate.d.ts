import { type EntityCandidate, type EntityType } from './types';
export interface CreateEntityCandidateInput {
    readonly entityType: EntityType;
    readonly internalId: string;
    readonly displayLabel: string;
    readonly canonicalLabel: string;
    readonly aliases: readonly string[];
    readonly discriminator?: string;
    readonly trustedMetadata: Readonly<Record<string, unknown>>;
    readonly stableTieBreakKey: string;
}
export declare function createEntityCandidate(input: CreateEntityCandidateInput): EntityCandidate;
export declare function revalidateEntityCandidate(value: EntityCandidate): EntityCandidate;

import type { CategoryCandidate } from './types';
export type MatchKind = 'EXACT' | 'CONTAINS' | 'TOKEN';
export interface KeywordMatch {
    categoryId: string;
    categoryName: string;
    keyword: string;
    kind: MatchKind;
}
/**
 * Find all keyword matches across all candidates for a normalized description.
 * Matches are pre-grouped by category; the caller ranks them.
 */
export declare function findMatches(normalized: string, tokens: string[], candidates: CategoryCandidate[]): KeywordMatch[];

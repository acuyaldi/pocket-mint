import type { ConfidenceLevel } from './types';
import type { KeywordMatch } from './keywordMatcher';
export interface ScoredMatch {
    categoryId: string;
    categoryName: string;
    confidence: ConfidenceLevel;
    /** The strongest individual match that contributed to this score. */
    bestMatch: KeywordMatch;
    /** Why this confidence level was assigned. */
    reason: string;
}
/**
 * Score and rank all keyword matches into confidence-assigned suggestions.
 * Results are ordered: HIGH → MEDIUM → LOW, then alphabetically by
 * category name within each tier.
 */
export declare function scoreMatches(matches: KeywordMatch[]): ScoredMatch[];

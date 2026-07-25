import type { CategorySuggestion, SuggestionInput } from './types';
/**
 * Produce ranked category suggestions for a transaction description.
 *
 * Returns up to 5 suggestions, ordered by confidence (HIGH → MEDIUM → LOW)
 * then alphabetically by category name.
 *
 * Returns empty array when no keywords match.
 */
export declare function generateSuggestions(input: SuggestionInput): CategorySuggestion[];

import type { SuggestionInput } from './types';
/**
 * Normalize a transaction description into a clean, deterministic form
 * suitable for keyword matching.
 *
 * Examples:
 *   "INDOMARET #123"   → "indomaret"
 *   "ALFAMART-001"     → "alfamart"
 *   "TRF  GO-JEK  ##"  → "go jek"
 *   "BAYAR   Listrik"  → "listrik"
 */
export declare function normalizeMerchant(raw: string): string;
/**
 * Extract individual keyword tokens from a normalized description for
 * partial/contains matching.
 */
export declare function tokenize(normalized: string): string[];
/**
 * Normalize the input description and return the normalized form
 * plus individual tokens.
 */
export declare function prepareForMatching(input: Pick<SuggestionInput, 'description'>): {
    normalized: string;
    tokens: string[];
};

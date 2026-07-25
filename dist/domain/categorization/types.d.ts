export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export interface CategorySuggestion {
    categoryId: string;
    categoryName: string;
    confidence: ConfidenceLevel;
    reason: string;
    matchedKeyword: string;
    normalizedMerchant: string;
}
export interface CategoryCandidate {
    categoryId: string;
    categoryName: string;
    keywords: string[];
}
export interface SuggestionInput {
    description: string;
    type: 'INCOME' | 'EXPENSE';
    candidates: CategoryCandidate[];
}

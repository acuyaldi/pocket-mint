import type { PrismaClient } from '../generated/prisma/client';
import type { CategorySuggestion } from '../domain/categorization';
type CategorizationPrismaClient = Pick<PrismaClient, 'category' | 'merchantMapping'>;
export declare function createCategorizationService(db: CategorizationPrismaClient): {
    getSuggestions: (userId: string, description: string, type: "INCOME" | "EXPENSE") => Promise<CategorySuggestion[]>;
};
/** Production instance bound to the shared Prisma singleton. */
export declare const categorizationService: {
    getSuggestions: (userId: string, description: string, type: "INCOME" | "EXPENSE") => Promise<CategorySuggestion[]>;
};
export {};

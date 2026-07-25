import type { ArchiveBudgetInput, BudgetCommandPrismaClient, BudgetRecord, CreateBudgetInput, RestoreBudgetInput, UpdateBudgetAmountInput } from './budget.types';
export declare function createBudgetService(db: BudgetCommandPrismaClient): {
    createBudget: (input: CreateBudgetInput) => Promise<BudgetRecord>;
    updateBudgetAmount: (input: UpdateBudgetAmountInput) => Promise<BudgetRecord>;
    archiveBudget: (input: ArchiveBudgetInput) => Promise<BudgetRecord>;
    restoreBudget: (input: RestoreBudgetInput) => Promise<BudgetRecord>;
};
/** Production instance bound to the shared Prisma singleton. */
export declare const budgetService: {
    createBudget: (input: CreateBudgetInput) => Promise<BudgetRecord>;
    updateBudgetAmount: (input: UpdateBudgetAmountInput) => Promise<BudgetRecord>;
    archiveBudget: (input: ArchiveBudgetInput) => Promise<BudgetRecord>;
    restoreBudget: (input: RestoreBudgetInput) => Promise<BudgetRecord>;
};

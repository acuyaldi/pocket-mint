import type { BudgetQueryPrismaClient, BudgetWithUsage, GetBudgetUsageInput, ListActiveBudgetUsageInput } from './budget-query.types';
export declare function createBudgetQueryService(db: BudgetQueryPrismaClient): {
    getBudgetUsage: (input: GetBudgetUsageInput) => Promise<BudgetWithUsage>;
    listActiveBudgetUsage: (input: ListActiveBudgetUsageInput) => Promise<BudgetWithUsage[]>;
};
/** Production instance bound to the shared Prisma singleton. */
export declare const budgetQueryService: {
    getBudgetUsage: (input: GetBudgetUsageInput) => Promise<BudgetWithUsage>;
    listActiveBudgetUsage: (input: ListActiveBudgetUsageInput) => Promise<BudgetWithUsage[]>;
};

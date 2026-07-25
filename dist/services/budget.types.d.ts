import type { PrismaClient, Prisma } from '../generated/prisma/client';
import type { BudgetRecord } from './budget-query.types';
export type { BudgetRecord };
/**
 * The slice of the Prisma client the command service needs: `budget`
 * (ownership-scoped reads and writes) and `category` (ownership + type
 * eligibility check). No `$transaction`: every mutation here is a single
 * write, matching wallet.service.ts / savingGoal.service.ts.
 */
export type BudgetCommandPrismaClient = Pick<PrismaClient, 'budget' | 'category'>;
/** Monetary value accepted from the controller; normalized to Decimal inside the service. */
export type DecimalInput = Prisma.Decimal | number | string;
/** `userId` is the authenticated caller, never taken from client input. */
export interface CreateBudgetInput {
    userId: string;
    categoryId: string;
    amount: DecimalInput;
}
export interface UpdateBudgetAmountInput {
    userId: string;
    budgetId: string;
    amount: DecimalInput;
}
export interface ArchiveBudgetInput {
    userId: string;
    budgetId: string;
}
export interface RestoreBudgetInput {
    userId: string;
    budgetId: string;
}

import type { ToolContract } from './types';
export interface TransactionCreateInput {
    type: 'INCOME' | 'EXPENSE';
    amount: string;
    walletId: string;
    categoryId: string;
    date: string;
    description?: string;
}
export interface TransactionCreateReferenceInput {
    type: 'INCOME' | 'EXPENSE';
    amount: string;
    walletReference: string;
    categoryId: string;
    date: string;
    description?: string;
    /** Optional merchant name reference — used for merchant resolution. */
    merchantReference?: string;
    /** Optional category name reference — used for category resolution. */
    categoryReference?: string;
}
export type TransactionCreateToolInput = TransactionCreateInput | TransactionCreateReferenceInput;
/**
 * One category row in the monthly spending summary. Mirrors the
 * existing AnalyticsCategoryBreakdownItem shape in terminology but
 * uses `number` (not Decimal) at the tool boundary — the execution
 * layer handles conversion.
 */
interface MonthlyCategoryBreakdown {
    name: string;
    amount: number;
    percentage: number | null;
}
/**
 * Structured result for `analytics.monthly-spending-summary`.
 * Combines the monthly summary (TransactionSummaryResult) and the
 * top expense-category breakdown into one read-only response.
 * All money amounts are numbers — the execution engine converts
 * from Decimal at the tool boundary.
 */
interface MonthlySpendingSummaryOutput {
    month: string;
    totalIncome: number;
    totalExpense: number;
    netSavings: number;
    transactionCount: number;
    topCategories: MonthlyCategoryBreakdown[];
}
/**
 * First read-only vertical-slice tool (§7 of the Phase 21.1 brief):
 *
 * Returns a structured summary of the authenticated user's spending
 * for a requested Jakarta calendar month.
 *
 * - Risk: LOW (read-only analytics)
 * - Confirmation: NONE
 * - Idempotency: NOT_REQUIRED (read is naturally idempotent)
 * - Timeout: 10 seconds
 */
export declare const monthlySpendingSummary: ToolContract<{
    month: string;
}, MonthlySpendingSummaryOutput>;
export declare const transactionCreate: ToolContract<TransactionCreateToolInput, TransactionCreateToolInput>;
export {};

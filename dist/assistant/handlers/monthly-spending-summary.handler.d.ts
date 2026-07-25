import type { ExecutionContext } from '../types';
export interface MonthlySpendingSummaryInput {
    month: string;
}
export interface MonthlyCategoryBreakdown {
    name: string;
    amount: number;
    percentage: number | null;
}
export interface MonthlySpendingSummaryOutput {
    month: string;
    totalIncome: number;
    totalExpense: number;
    netSavings: number;
    transactionCount: number;
    topCategories: MonthlyCategoryBreakdown[];
}
export declare function handleMonthlySpendingSummary(input: MonthlySpendingSummaryInput, ctx: ExecutionContext): Promise<MonthlySpendingSummaryOutput>;

import type { PrismaClient, Prisma, CategoryType } from '../generated/prisma/client';
import type { AnalyticsPeriod, TrendGranularity } from '../domain/analyticsPeriod';
import type { TransactionType } from '../models/transaction.model';
/** The slice of the Prisma client the Analytics v2 read services need. */
export type AnalyticsPrismaClient = Pick<PrismaClient, 'transaction' | 'wallet' | 'category'>;
/** Shared period-query input every aggregation endpoint (except budget-performance) accepts. */
export interface AnalyticsPeriodQueryInput {
    userId: string;
    period?: string;
    startDate?: string;
    endDate?: string;
}
/** `{ value }` when a baseline existed, or an explicit unavailable marker — never `Infinity`/`NaN`. */
export type PercentageChange = {
    value: Prisma.Decimal;
} | {
    value: null;
    reason: 'ZERO_BASELINE';
};
export interface AnalyticsOverviewResult {
    period: AnalyticsPeriod;
    periodStart: Date;
    periodEnd: Date;
    income: Prisma.Decimal;
    expense: Prisma.Decimal;
    netCashFlow: Prisma.Decimal;
    transactionCount: number;
    previous: {
        periodStart: Date;
        periodEnd: Date;
        income: Prisma.Decimal;
        expense: Prisma.Decimal;
        netCashFlow: Prisma.Decimal;
    };
    change: {
        income: Prisma.Decimal;
        expense: Prisma.Decimal;
        netCashFlow: Prisma.Decimal;
    };
    percentageChange: {
        income: PercentageChange;
        expense: PercentageChange;
        netCashFlow: PercentageChange;
    };
}
export interface AnalyticsTrendBucket {
    start: Date;
    end: Date;
    income: Prisma.Decimal;
    expense: Prisma.Decimal;
    netCashFlow: Prisma.Decimal;
}
export interface AnalyticsTrendsResult {
    period: AnalyticsPeriod;
    periodStart: Date;
    periodEnd: Date;
    granularity: TrendGranularity;
    buckets: AnalyticsTrendBucket[];
}
export interface AnalyticsCategoryBreakdownInput extends AnalyticsPeriodQueryInput {
    type: CategoryType;
}
export interface AnalyticsCategoryBreakdownItem {
    categoryId: string | null;
    name: string;
    amount: Prisma.Decimal;
    transactionCount: number;
    /** null only when `total` is zero (no matching transactions at all). */
    percentage: Prisma.Decimal | null;
}
export interface AnalyticsCategoryBreakdownResult {
    period: AnalyticsPeriod;
    periodStart: Date;
    periodEnd: Date;
    type: CategoryType;
    total: Prisma.Decimal;
    categories: AnalyticsCategoryBreakdownItem[];
}
export interface AnalyticsWalletBreakdownItem {
    id: string;
    name: string;
    income: Prisma.Decimal;
    expense: Prisma.Decimal;
    netCashFlow: Prisma.Decimal;
    transactionCount: number;
}
export interface AnalyticsWalletBreakdownResult {
    period: AnalyticsPeriod;
    periodStart: Date;
    periodEnd: Date;
    wallets: AnalyticsWalletBreakdownItem[];
}
export type { TransactionType };

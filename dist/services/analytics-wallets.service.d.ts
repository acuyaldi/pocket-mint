import type { AnalyticsPeriodQueryInput, AnalyticsPrismaClient, AnalyticsWalletBreakdownResult } from './analytics-query.types';
export declare function createAnalyticsWalletsService(db: AnalyticsPrismaClient): {
    getWalletBreakdown: (input: AnalyticsPeriodQueryInput) => Promise<AnalyticsWalletBreakdownResult>;
};
/** Production instance bound to the shared Prisma singleton. */
export declare const analyticsWalletsService: {
    getWalletBreakdown: (input: AnalyticsPeriodQueryInput) => Promise<AnalyticsWalletBreakdownResult>;
};

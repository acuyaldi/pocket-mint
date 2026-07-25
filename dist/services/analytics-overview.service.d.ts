import type { AnalyticsOverviewResult, AnalyticsPeriodQueryInput, AnalyticsPrismaClient } from './analytics-query.types';
export declare function createAnalyticsOverviewService(db: AnalyticsPrismaClient): {
    getOverview: (input: AnalyticsPeriodQueryInput) => Promise<AnalyticsOverviewResult>;
};
/** Production instance bound to the shared Prisma singleton. */
export declare const analyticsOverviewService: {
    getOverview: (input: AnalyticsPeriodQueryInput) => Promise<AnalyticsOverviewResult>;
};

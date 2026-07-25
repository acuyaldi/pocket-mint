import type { AnalyticsPeriodQueryInput, AnalyticsPrismaClient, AnalyticsTrendsResult } from './analytics-query.types';
export declare function createAnalyticsTrendsService(db: AnalyticsPrismaClient): {
    getTrends: (input: AnalyticsPeriodQueryInput) => Promise<AnalyticsTrendsResult>;
};
/** Production instance bound to the shared Prisma singleton. */
export declare const analyticsTrendsService: {
    getTrends: (input: AnalyticsPeriodQueryInput) => Promise<AnalyticsTrendsResult>;
};

import type { DashboardQueryPrismaClient, DashboardSummaryResult, GetDashboardSummaryInput } from './dashboard-query.types';
export declare function createDashboardQueryService(db: DashboardQueryPrismaClient): {
    getSummary: (input: GetDashboardSummaryInput) => Promise<DashboardSummaryResult>;
};
/** Production instance bound to the shared Prisma singleton. */
export declare const dashboardQueryService: {
    getSummary: (input: GetDashboardSummaryInput) => Promise<DashboardSummaryResult>;
};

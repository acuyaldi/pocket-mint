import { type ReportingRange } from './reportingTime';
export type AnalyticsPeriod = 'current-month' | 'previous-month' | 'last-3-months' | 'last-6-months' | 'current-year' | 'custom';
export declare const ANALYTICS_PERIODS: readonly AnalyticsPeriod[];
/** Custom ranges beyond this many days are rejected (400) — an unbounded scan is not a "period". */
export declare const MAX_CUSTOM_RANGE_DAYS = 400;
export interface AnalyticsPeriodInput {
    period?: string;
    /** `YYYY-MM-DD`, required (with `endDate`) when `period === 'custom'`. Inclusive. */
    startDate?: string;
    /** `YYYY-MM-DD`, required (with `startDate`) when `period === 'custom'`. Inclusive. */
    endDate?: string;
}
export interface ResolvedAnalyticsPeriod {
    period: AnalyticsPeriod;
    range: ReportingRange;
    /** Immediately preceding range of equal duration — the comparison baseline. */
    previousRange: ReportingRange;
}
/**
 * Resolve a `period` query param (+ optional custom bounds) into a half-open
 * reporting range and its comparison baseline. Throws a plain `Error` (safe,
 * user-facing message) on an unknown period, a missing/malformed custom bound,
 * an inverted custom range, or a custom range exceeding `MAX_CUSTOM_RANGE_DAYS`
 * — callers (analytics services) translate this into a typed 400
 * `AnalyticsError`; this module stays free of HTTP/service concerns.
 */
export declare function resolveAnalyticsPeriod(input: AnalyticsPeriodInput, zone: string, now?: Date): ResolvedAnalyticsPeriod;
export type TrendGranularity = 'day' | 'month';
export declare function resolveTrendGranularity(range: ReportingRange): TrendGranularity;
export interface TrendBucket {
    start: Date;
    end: Date;
}
/**
 * Generate contiguous, zero-gap buckets covering `range` at the given
 * granularity — the caller (analytics-trends.service.ts) fills each bucket's
 * income/expense from a single query, so every bucket must exist up front
 * (a period with no transactions still returns a full zero-filled series).
 */
export declare function generateTrendBuckets(range: ReportingRange, granularity: TrendGranularity, zone: string): TrendBucket[];

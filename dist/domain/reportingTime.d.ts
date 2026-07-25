export interface CalendarDate {
    year: number;
    month: number;
    day: number;
}
export interface CalendarMonth {
    year: number;
    month: number;
}
export interface ReportingRange {
    startInclusive: Date;
    endExclusive: Date;
}
export interface ReportingDayRange extends ReportingRange {
    label: string;
}
export declare function assertValidTimeZone(zone: string): string;
export declare function formatReportingDate(instant: Date, zone: string): string;
export declare function getReportingDayRange(value: CalendarDate, zone: string): ReportingRange;
export declare function getReportingMonthRange(value: CalendarMonth, zone: string): ReportingRange;
export declare function getPreviousReportingMonthRange(value: CalendarMonth, zone: string): ReportingRange;
/** Shift a calendar month by `delta` months (may be negative), handling year rollover. */
export declare function shiftCalendarMonth(value: CalendarMonth, delta: number): CalendarMonth;
/**
 * The half-open reporting range spanning `monthsBack` calendar months ending
 * at (and including) `anchor` — e.g. `monthsBack: 3` with anchor July 2026
 * covers May 1 through the end of July 2026. Used by Analytics v2's
 * last-3-months/last-6-months periods (`src/domain/analyticsPeriod.ts`).
 */
export declare function getReportingMonthsRange(anchor: CalendarMonth, monthsBack: number, zone: string): ReportingRange;
/** The half-open reporting range for a full calendar year (Jan 1 – Dec 31 inclusive). */
export declare function getReportingYearRange(year: number, zone: string): ReportingRange;
export declare function getRollingDayRanges(now: Date, days: number, zone: string): ReportingDayRange[];
export declare function parseBusinessDate(value: string | undefined, zone: string, now?: Date): Date;
/**
 * Reporting/export-scoped parser for a `YYYY-MM` anchor month (e.g. the
 * Analytics-page export's `anchor` query param). Deliberately separate from
 * `parseBusinessDate`, which is shared by unrelated domains (transactions,
 * recurring, installments, saving goals, the reminder engine) and must not
 * silently accept month-only input.
 */
export declare function parseReportingAnchor(value: string | undefined, zone: string, now?: Date): Date;

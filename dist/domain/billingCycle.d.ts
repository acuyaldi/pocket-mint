export interface BillingCycleInput {
    transactionDate: string;
    cutoffDay: number;
    paymentDueDay: number;
    timeZone: 'Asia/Jakarta';
}
export declare function clampDay(year: number, monthIndex: number, day: number): string;
export declare function addBillingMonth(date: string, months: number): string;
/** Next monthly occurrence on/after `todayStr`, clamped to `endDate` (inclusive), or null once the recurrence has ended. */
export declare function nextMonthlyOccurrence(startDate: string, endDate: string | null, todayStr: string): string | null;
export declare function calculateFirstDueDate(input: BillingCycleInput): string;

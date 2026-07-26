import type { ErrorCategory } from '../../utils/logger';
export declare function isRetryableCategory(category: ErrorCategory): boolean;
/** Bounded exponential backoff with jitter. Never grows unbounded. */
export declare function computeBackoffMs(attempt: number, baseMs: number, maxMs: number): number;
export interface RetryDecision {
    readonly outcome: 'retry' | 'terminal';
    readonly availableAt?: Date;
}
/** Decides retry vs terminal for a failed attempt, given the category and configured limits. */
export declare function decideRetry(category: ErrorCategory, attempt: number, maxAttempts: number, backoff: {
    baseMs: number;
    maxMs: number;
}, retryAfterMs?: number): RetryDecision;

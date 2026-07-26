import type { ErrorCategory } from '../../utils/logger';

/** Categories worth retrying. Everything else is terminal — no infinite retries. */
const RETRYABLE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  'provider_timeout',
  'provider_unavailable',
  'provider_rate_limit',
  'database',
  'network',
]);

export function isRetryableCategory(category: ErrorCategory): boolean {
  return RETRYABLE_CATEGORIES.has(category);
}

/** Bounded exponential backoff with jitter. Never grows unbounded. */
export function computeBackoffMs(attempt: number, baseMs: number, maxMs: number): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.random() * exp * 0.2;
  return Math.min(maxMs, Math.round(exp + jitter));
}

export interface RetryDecision {
  readonly outcome: 'retry' | 'terminal';
  readonly availableAt?: Date;
}

/** Decides retry vs terminal for a failed attempt, given the category and configured limits. */
export function decideRetry(
  category: ErrorCategory,
  attempt: number,
  maxAttempts: number,
  backoff: { baseMs: number; maxMs: number },
  retryAfterMs?: number,
): RetryDecision {
  if (!isRetryableCategory(category) || attempt >= maxAttempts) {
    return { outcome: 'terminal' };
  }
  const delayMs = retryAfterMs ?? computeBackoffMs(attempt, backoff.baseMs, backoff.maxMs);
  return { outcome: 'retry', availableAt: new Date(Date.now() + delayMs) };
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRetryableCategory = isRetryableCategory;
exports.computeBackoffMs = computeBackoffMs;
exports.decideRetry = decideRetry;
/** Categories worth retrying. Everything else is terminal — no infinite retries. */
const RETRYABLE_CATEGORIES = new Set([
    'provider_timeout',
    'provider_unavailable',
    'provider_rate_limit',
    'database',
    'network',
]);
function isRetryableCategory(category) {
    return RETRYABLE_CATEGORIES.has(category);
}
/** Bounded exponential backoff with jitter. Never grows unbounded. */
function computeBackoffMs(attempt, baseMs, maxMs) {
    const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
    const jitter = Math.random() * exp * 0.2;
    return Math.min(maxMs, Math.round(exp + jitter));
}
/** Decides retry vs terminal for a failed attempt, given the category and configured limits. */
function decideRetry(category, attempt, maxAttempts, backoff, retryAfterMs) {
    if (!isRetryableCategory(category) || attempt >= maxAttempts) {
        return { outcome: 'terminal' };
    }
    const delayMs = retryAfterMs ?? computeBackoffMs(attempt, backoff.baseMs, backoff.maxMs);
    return { outcome: 'retry', availableAt: new Date(Date.now() + delayMs) };
}
//# sourceMappingURL=retry.js.map
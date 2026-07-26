import { describe, expect, it } from 'vitest';
import { computeBackoffMs, decideRetry, isRetryableCategory } from '../../../src/channels/workers/retry';

describe('isRetryableCategory', () => {
  it('treats transient provider/db/network errors as retryable', () => {
    expect(isRetryableCategory('provider_timeout')).toBe(true);
    expect(isRetryableCategory('provider_unavailable')).toBe(true);
    expect(isRetryableCategory('provider_rate_limit')).toBe(true);
    expect(isRetryableCategory('database')).toBe(true);
    expect(isRetryableCategory('network')).toBe(true);
  });

  it('treats policy/validation/auth errors as terminal', () => {
    expect(isRetryableCategory('authorization')).toBe(false);
    expect(isRetryableCategory('validation')).toBe(false);
    expect(isRetryableCategory('policy_rejected')).toBe(false);
    expect(isRetryableCategory('provider_invalid_response')).toBe(false);
  });
});

describe('computeBackoffMs', () => {
  it('grows with attempt number but never exceeds maxMs', () => {
    const base = 1000;
    const max = 10_000;
    for (let attempt = 1; attempt <= 10; attempt++) {
      const delay = computeBackoffMs(attempt, base, max);
      expect(delay).toBeGreaterThanOrEqual(base);
      expect(delay).toBeLessThanOrEqual(max * 1.2);
    }
  });
});

describe('decideRetry', () => {
  it('retries a retryable category under the attempt limit', () => {
    const decision = decideRetry('provider_unavailable', 1, 5, { baseMs: 100, maxMs: 1000 });
    expect(decision.outcome).toBe('retry');
    expect(decision.availableAt).toBeInstanceOf(Date);
    expect(decision.availableAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('goes terminal once attempts are exhausted, even for a retryable category', () => {
    const decision = decideRetry('provider_unavailable', 5, 5, { baseMs: 100, maxMs: 1000 });
    expect(decision.outcome).toBe('terminal');
  });

  it('goes terminal immediately for a non-retryable category regardless of attempt count', () => {
    const decision = decideRetry('authorization', 1, 5, { baseMs: 100, maxMs: 1000 });
    expect(decision.outcome).toBe('terminal');
  });

  it('honors an explicit retry-after hint over computed backoff', () => {
    const decision = decideRetry('provider_rate_limit', 1, 5, { baseMs: 100, maxMs: 1000 }, 5000);
    expect(decision.outcome).toBe('retry');
    expect(decision.availableAt!.getTime()).toBeGreaterThanOrEqual(Date.now() + 4900);
  });
});

import { describe, it, expect } from 'vitest';
import { categorizeError } from '../src/utils/errorCategory';
import { AssistantError } from '../src/assistant/errors';
import { AssistantProviderError } from '../src/assistant/provider-types';

describe('categorizeError', () => {
  it.each([
    [AssistantError.invalidRequest('bad'), 'validation'],
    [AssistantError.draftNotFound(), 'not_found'],
    [AssistantError.policyDenied('tool', 'reason'), 'policy_rejected'],
    [AssistantError.clarificationExpired(), 'expired'],
    [AssistantError.clarificationAlreadyConsumed(), 'already_consumed'],
    [AssistantError.idempotencyConflict(), 'idempotency'],
    [AssistantError.conversationNotContinuable(), 'conflict'],
  ] as const)('maps %#: %s to %s', (err, expected) => {
    expect(categorizeError(err)).toBe(expected);
  });

  it('distinguishes draft conflict EXPIRED from other conflict statuses via structured detail, not message text', () => {
    expect(categorizeError(AssistantError.draftConflict('EXPIRED'))).toBe('expired');
    expect(categorizeError(AssistantError.draftConflict('CANCELLED'))).toBe('conflict');
  });

  it.each([
    [AssistantProviderError.timeout(), 'provider_timeout'],
    [AssistantProviderError.rateLimited(), 'provider_rate_limit'],
    [AssistantProviderError.invalidResponse(), 'provider_invalid_response'],
    [AssistantProviderError.unavailable(), 'provider_unavailable'],
    [AssistantProviderError.refused(), 'provider_invalid_response'],
  ] as const)('maps provider error %# to %s', (err, expected) => {
    expect(categorizeError(err)).toBe(expected);
  });

  it('maps generic HTTP-status-carrying errors by status, never by message content', () => {
    expect(categorizeError({ statusCode: 401, message: 'Bearer eyJhbGciOi... leaked' })).toBe('authentication');
    expect(categorizeError({ statusCode: 403 })).toBe('authorization');
    expect(categorizeError({ statusCode: 404 })).toBe('not_found');
    expect(categorizeError({ statusCode: 429 })).toBe('provider_rate_limit');
  });

  it('maps a Prisma-style error code to database', () => {
    expect(categorizeError({ code: 'P2002' })).toBe('database');
  });

  it('falls back to internal for a wholly unknown error shape', () => {
    expect(categorizeError(new Error('something unexpected'))).toBe('internal');
    expect(categorizeError('not even an object')).toBe('internal');
    expect(categorizeError(undefined)).toBe('internal');
  });
});

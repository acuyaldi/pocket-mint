import { describe, expect, it } from 'vitest';
import { corsOptions } from '../../src/middleware/cors';

describe('CORS allowed headers', () => {
  it('allows Idempotency-Key so the browser can send it on draft confirm without a blocked preflight', () => {
    expect(corsOptions.allowedHeaders).toContain('Idempotency-Key');
  });

  it('never re-advertises the retired identity headers', () => {
    const headers = corsOptions.allowedHeaders as string[];
    expect(headers).not.toContain('x-api-key');
    expect(headers).not.toContain('x-user-id');
    expect(headers).not.toContain('x-user-email');
  });
});

import { describe, it, expect } from 'vitest';
import { assertTestDatabaseUrl, assertDatabaseUrlsMatch } from '../src/lib/assertTestDatabaseUrl';

describe('assertTestDatabaseUrl', () => {
  it('accepts a disposable local/CI database URL', () => {
    expect(() => assertTestDatabaseUrl('postgresql://postgres:postgres@localhost:5432/pocketmint_test')).not.toThrow();
  });

  it('rejects a Supabase host', () => {
    expect(() => assertTestDatabaseUrl('postgresql://postgres:pw@db.abcxyz.supabase.co:5432/postgres')).toThrow(
      /production/,
    );
  });

  it('rejects the Supabase default database name even on a non-Supabase host', () => {
    expect(() => assertTestDatabaseUrl('postgresql://postgres:pw@some-managed-host:5432/postgres')).toThrow(
      /production/,
    );
  });

  it('rejects a malformed URL', () => {
    expect(() => assertTestDatabaseUrl('not-a-url')).toThrow();
  });
});

describe('assertDatabaseUrlsMatch', () => {
  const testUrl = 'postgresql://postgres:postgres@localhost:5432/pocketmint_test';

  it('passes when DATABASE_URL is not set', () => {
    expect(() => assertDatabaseUrlsMatch(undefined, testUrl)).not.toThrow();
  });

  it('passes when both URLs point at the same host, port, and database', () => {
    expect(() =>
      assertDatabaseUrlsMatch('postgresql://otheruser:otherpw@localhost:5432/pocketmint_test?sslmode=disable', testUrl),
    ).not.toThrow();
  });

  it('rejects a different database name on the same host', () => {
    expect(() =>
      assertDatabaseUrlsMatch('postgresql://postgres:postgres@localhost:5432/some_other_db', testUrl),
    ).toThrow(/different databases/);
  });

  it('rejects a different host', () => {
    expect(() =>
      assertDatabaseUrlsMatch('postgresql://postgres:postgres@db.internal:5432/pocketmint_test', testUrl),
    ).toThrow(/different databases/);
  });

  it('does not leak credentials in the error message', () => {
    try {
      assertDatabaseUrlsMatch('postgresql://secretuser:secretpw@db.internal:5432/prod', testUrl);
      throw new Error('expected assertDatabaseUrlsMatch to throw');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain('secretuser');
      expect(message).not.toContain('secretpw');
      expect(message).not.toContain('db.internal');
    }
  });

  it('rejects a malformed DATABASE_URL', () => {
    expect(() => assertDatabaseUrlsMatch('not-a-url', testUrl)).toThrow();
  });
});

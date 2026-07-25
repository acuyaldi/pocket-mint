/**
 * Fail-fast guard for the disposable integration-test database.
 *
 * `TEST_DATABASE_URL` must point at a throwaway local/CI Postgres — never at
 * Supabase or any other shared/production host. This is checked synchronously
 * at test-collection time (before any connection is opened) so a misconfigured
 * env fails the whole suite immediately instead of silently running — or
 * skipping — against the wrong database.
 */
export declare function assertTestDatabaseUrl(rawUrl: string): void;

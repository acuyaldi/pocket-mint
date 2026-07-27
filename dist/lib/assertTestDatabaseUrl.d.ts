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
/**
 * Fail-fast guard against a split-brain integration run: fixtures written
 * through `TEST_DATABASE_URL` while application code reads through
 * `DATABASE_URL` bound to a different database. That split produces
 * misleading test failures (data "missing" that was actually written
 * elsewhere) instead of an honest configuration error.
 *
 * `databaseUrl` is optional because the repository's existing tooling (CI,
 * `scripts/run-integration-tests.mjs`) intentionally leaves `DATABASE_URL`
 * unset while running the integration suite — that is not a misconfiguration
 * and must keep working exactly as it does today. This guard only fires when
 * both variables are set and point at different databases.
 */
export declare function assertDatabaseUrlsMatch(databaseUrl: string | undefined, testDatabaseUrl: string): void;

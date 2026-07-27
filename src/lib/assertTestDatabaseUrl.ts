/**
 * Fail-fast guard for the disposable integration-test database.
 *
 * `TEST_DATABASE_URL` must point at a throwaway local/CI Postgres — never at
 * Supabase or any other shared/production host. This is checked synchronously
 * at test-collection time (before any connection is opened) so a misconfigured
 * env fails the whole suite immediately instead of silently running — or
 * skipping — against the wrong database.
 */

const BLOCKED_HOST_PATTERNS = [/supabase\.co$/i, /supabase\.in$/i, /rds\.amazonaws\.com$/i];
/** Supabase's default database name — a strong signal this isn't a disposable instance. */
const BLOCKED_DATABASE_NAMES = ['postgres'];

export function assertTestDatabaseUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid connection string.');
  }

  const host = url.hostname;
  if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    throw new Error(
      `TEST_DATABASE_URL host "${host}" looks like a production/managed database. ` +
        'Point it at a disposable local or CI-only PostgreSQL instance instead.',
    );
  }

  const databaseName = url.pathname.replace(/^\//, '');
  if (BLOCKED_DATABASE_NAMES.includes(databaseName)) {
    throw new Error(
      `TEST_DATABASE_URL database name "${databaseName}" is Supabase's default database name — ` +
        'this looks like a production/managed database, not a disposable test instance.',
    );
  }
}

/** The connection details that identify which physical database a URL points at. */
function effectiveDestination(rawUrl: string): string {
  const url = new URL(rawUrl);
  const port = url.port || '5432';
  return `${url.hostname.toLowerCase()}:${port}${url.pathname}`;
}

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
export function assertDatabaseUrlsMatch(databaseUrl: string | undefined, testDatabaseUrl: string): void {
  if (!databaseUrl) return;

  let same: boolean;
  try {
    same = effectiveDestination(databaseUrl) === effectiveDestination(testDatabaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid connection string.');
  }

  if (!same) {
    throw new Error(
      'DATABASE_URL and TEST_DATABASE_URL point at different databases. Integration fixtures and application ' +
        'queries must target the same disposable database — set both to identical values before running the ' +
        'integration suite.',
    );
  }
}

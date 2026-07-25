#!/usr/bin/env node
// Local/CI runner for the Prisma integration suite against a disposable
// PostgreSQL. See docs/database-testing.md.
//
// - TEST_DATABASE_URL already set (CI's postgres service, or a developer's own
//   disposable instance): reused as-is.
// - TEST_DATABASE_URL unset (default local dev): boots a throwaway
//   embedded-postgres instance for this run only, then tears it down.
//
// Either way: `prisma migrate deploy` runs against the disposable URL first
// (never `db push`), then the integration test file runs, then teardown.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

// Mirrors src/lib/assertTestDatabaseUrl.ts. Duplicated (not imported) because
// this script runs standalone via plain Node, outside the TS build — keep the
// two in sync if the production-host patterns change.
const BLOCKED_HOST_PATTERNS = [/supabase\.co$/i, /supabase\.in$/i, /rds\.amazonaws\.com$/i];
const BLOCKED_DATABASE_NAMES = ['postgres'];

function assertTestDatabaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (BLOCKED_HOST_PATTERNS.some((p) => p.test(url.hostname))) {
    throw new Error(`TEST_DATABASE_URL host "${url.hostname}" looks like a production/managed database.`);
  }
  const databaseName = url.pathname.replace(/^\//, '');
  if (BLOCKED_DATABASE_NAMES.includes(databaseName)) {
    throw new Error(
      `TEST_DATABASE_URL database name "${databaseName}" looks like a production default, not a disposable test database.`,
    );
  }
}

function run(command, args, env) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}`);
  }
}

const integrationTests = [
  'test/prismaAdapter.integration.test.ts',
  'test/notificationRefreshE2E.integration.test.ts',
  'test/analytics.integration.test.ts',
  'test/assistant/monthly-summary.integration.test.ts',
  'test/assistant/conversation-service.integration.test.ts',
  'test/assistant/conversation-http.integration.test.ts',
  'test/assistant/financial-draft.integration.test.ts',
  'test/assistant/context-service.integration.test.ts',
  'test/assistant/provider-runtime.integration.test.ts',
  'test/assistant/clarification-sequential.integration.test.ts',
];

async function main() {
  const existing = process.env.TEST_DATABASE_URL;
  if (existing) {
    assertTestDatabaseUrl(existing);
    console.log('Using existing TEST_DATABASE_URL.');
    run('npx', ['prisma', 'migrate', 'deploy'], { DATABASE_URL: existing });
    run('npx', ['vitest', 'run', ...integrationTests], { TEST_DATABASE_URL: existing, DATABASE_URL: existing });
    return;
  }

  // ponytail: fixed port, first-writer-wins. Set EMBEDDED_PG_PORT if 55432 is taken locally.
  const port = Number(process.env.EMBEDDED_PG_PORT) || 55432;
  const databaseDir = mkdtempSync(join(tmpdir(), 'pocket-mint-pg-'));
  const testDatabaseUrl = `postgresql://postgres:postgres@localhost:${port}/pocketmint_test`;
  assertTestDatabaseUrl(testDatabaseUrl);

  const pg = new EmbeddedPostgres({
    databaseDir,
    port,
    user: 'postgres',
    password: 'postgres',
    persistent: false,
  });

  console.log(`Booting disposable Postgres on port ${port}...`);
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('pocketmint_test');

  try {
    run('npx', ['prisma', 'migrate', 'deploy'], { DATABASE_URL: testDatabaseUrl });
    run('npx', ['vitest', 'run', ...integrationTests], { TEST_DATABASE_URL: testDatabaseUrl, DATABASE_URL: testDatabaseUrl });
  } finally {
    console.log('Stopping disposable Postgres...');
    await pg.stop();
    rmSync(databaseDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

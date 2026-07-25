---
name: deployment-operations
description: Use when working on Railway or Supabase environments, Vercel coordination, GitHub Actions CI, migration rollout to shared databases, secrets, or scaling decisions.
---

# Deployment & Operations

## Environments (never mix)

| | Staging | Production |
| --- | --- | --- |
| Branch | `dev` | `main` |
| App | Railway staging service | Railway production service |
| DB/Auth | Supabase Dev project | Supabase Production project |
| Frontend | Vercel Preview | Vercel Production |

`master` is a retired legacy branch — it is not an environment and must not be
deployed from.

## Railway

- Staging service auto-deploys from `dev`; production from `main` (Railway
  Git integration is the CD; GitHub Actions is CI only).
- Health check path: `/health` (returns `{ status: 'ok', ... }`).
- Build/start use the repository scripts: `npm run build` / `npm start`.
  `PORT` is injected by Railway and must be honored (config already does).
- **Do not put `prisma migrate deploy` into app startup.** Migration rollout is
  a controlled manual step; this stays forbidden until the user explicitly
  lifts it in writing (see `prisma-database.skill.md` and
  `docs/prisma-migration-reconciliation.md`).
- Deployment happens only via merge to `dev`/`main` (Railway Git
  integration) — there is no sanctioned manual `railway up`-style deploy path.
- One replica for this small personal project unless metrics prove otherwise.
  Rate limits are per-instance (in-memory) — scaling out changes behavior.

## Supabase

- Dev and Production projects stay isolated; signature verification (per-project
  JWT keys) is what isolates them — never point staging at the prod project.
- **Credentials that appeared in Git history must be confirmed rotated before
  any deploy** — a standing blocker until verified (see the staging-blocker
  notes and `docs/deployment-runbook.md` §10).
- `db.<ref>.supabase.co` resolves **IPv6-only**; IPv4-only platform egress
  (Railway default) needs Supavisor URLs: transaction pooler (`:6543`) for
  `DATABASE_URL`, session mode (`:5432`) for `DIRECT_URL`/migrations.
- Never use the Production DB for staging.

## Vercel Coordination

- FE Preview `NEXT_PUBLIC_API_URL` → Railway staging origin + `/api/v1`.
- Railway staging `CORS_ALLOWED_ORIGINS` must contain the **exact** FE Preview
  origin (no wildcard).
- Supabase auth redirect URLs must include the preview callback/reset routes.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on PR/push to `dev` and
`main`, against an ephemeral `postgres:18` service container. In order:

1. Checkout, Node 22 setup (`actions/setup-node`, npm cache), `npm ci`.
2. `npx prisma validate`.
3. **Migration directory check**: `migration_lock.toml` exists and at least
   one migration directory is present under `prisma/migrations/`.
4. **Dangerous-command check**: greps `package.json`, `scripts`, `src`,
   `Dockerfile*`, `railway.json`, `railway.toml`, `nixpacks.toml` for
   `prisma migrate dev|reset` or `prisma db push` — fails the build if found.
5. **Startup-migration check**: same grep for `prisma migrate deploy` —
   fails the build if it appears in runtime/deploy config (migration deploy
   must never run at app startup or build time).
6. `npx tsc --noEmit`.
7. `npx prisma migrate deploy` against the ephemeral Postgres (this **is**
   the fresh-database migration replay — there is no separate migration job).
8. Verifies `TEST_DATABASE_URL` is set (fails the build otherwise — integration
   tests must not silently skip).
9. `npx vitest run --reporter=default`.
10. `npm run build`.
11. **CRLF normalization**: strips `\r` from `src/generated/prisma/runtime/{client.d.ts,index-browser.d.ts}` and the `dist/` copies (Prisma ships these CRLF inside the npm package; the repo tracks them as LF).
12. `git diff --check` then a clean-tree check (`git diff --quiet` and
    `git status --porcelain` must both report nothing) — this is what enforces
    that generated/build output (including `dist/`) matches what's committed.
    There is no separate, standalone "packaging check" step in CI — the
    generated-client packaging verification in
    `prisma-database.skill.md` is a manual command an agent runs locally, not
    a distinct CI job.

Never bypass failing CI (no force-merge, no skipping steps locally to
"match"). PRs target `dev`; a release PR `dev → main` requires an explicit
release instruction from the user. Branch filters are `dev`/`main` — pushes/
PRs to `main` trigger CI, so a release PR into `main` is gated the same as
`dev`. `master` is not a CI branch filter and is not deployed from.

### Manual rollout conventions vs. CI enforcement

`prisma migrate status` / `prisma migrate diff` against staging or production
are **manual, human-run conventions** (see `docs/prisma-migration-reconciliation.md`
and `docs/deployment-runbook.md`) — CI only replays migrations against the
disposable ephemeral database above. CI never touches staging or production.

## Migrations Against Shared Databases

- Read-only first: `prisma migrate status` / `migrate diff`.
- Backup / confirm PITR before anything destructive.
- Never run remote migrations from an unidentified environment — prove which DB
  you are pointed at first.
- Record commands in docs/runbooks with `<placeholders>`, never secret values.
- Full procedure: `docs/deployment-runbook.md` §5–§9.

## Tracked `dist/` Build Artifact

- `dist/` is a committed, tracked build output. CI's clean-tree check (step
  12 above) fails the build if `npm run build` produces any diff against what
  is committed — so after any `src/` change, rerun `npm run build` and commit
  the resulting `dist/` changes together with the source.
- Prisma's generated client under `dist/generated/prisma` (and
  `src/generated/prisma`) is also tracked, but its packaging convention and
  verification command are owned by `prisma-database.skill.md` — this file
  only owns the general "rebuild and commit `dist/`" rule and its CI
  enforcement.

## Deployment Stability Status

- **PM-STAB-004** (CI branch filters / production migration reconciliation):
  the code fix (branch filters, baseline reconciliation) has been executed
  and verified against the real production database and a post-deploy
  `/health` check — see `docs/prisma-migration-reconciliation.md` for the
  verification record. Do not describe a *different, new* stability item as
  resolved based on staging or disposable-DB verification alone; production
  plus post-deploy smoke validation is the bar. This is the single canonical
  status for PM-STAB-004 — other skills must cross-reference this section
  rather than restate it.

## Cost-Conscious Defaults (<~10 users)

- One Railway replica; conservative `DB_POOL_MAX` (default 10).
- Monitor metrics before scaling anything.
- No Redis, Kubernetes, queues, or other infrastructure without evidence.

## Common Mistakes

- Adding a `railway.json`/startup hook that auto-migrates — rollout is manual
  and ordered while the baseline is being reconciled.
- Deploying backend before the frontend sends `Authorization: Bearer` —
  every request 401s (golden rule in the runbook).
- Putting a real connection string in a runbook/commit to "document" it.

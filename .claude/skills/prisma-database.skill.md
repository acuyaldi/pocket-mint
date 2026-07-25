---
name: prisma-database
description: Use when touching Prisma schema, migrations, the generated client, connection pooling, DATABASE_URL/DIRECT_URL, or database provisioning/deployment.
---

# Prisma & Database — Prisma 7 Adapter Architecture

## Runtime

Prisma 7 `client` engine needs a driver adapter. The composition is:

```
pg.Pool → PrismaPg → PrismaClient({ adapter })
```

- Use the existing singleton `src/lib/prisma.ts` (built by
  `createPrismaResources` in `src/lib/prismaFactory.ts`). **Never instantiate
  another PrismaClient** in application code.
- Development caches client + pool on `globalThis` (hot-reload safe) — preserve
  that.
- Pool sizing is **process-local**: total server-side connections =
  `DB_POOL_MAX (default 10) × instance count`. Keep the product under the
  provider limit.
- Details: `docs/prisma-runtime-connection.md`.

## URLs

- `DATABASE_URL` = application runtime URL (Supavisor transaction pooler ok)
- `DIRECT_URL` = migration/direct or session-mode URL (Prisma migrate)
- **Never print either**, not even partially, not in errors or docs.

## Generated Client Packaging

- Generator output: `src/generated/prisma` (custom path — see `schema.prisma`).
- `npm run build` runs `prisma generate`, strips whitespace from the generated
  `.d.ts`, `tsc`, then `copy-prisma-client.cjs` copies the client into
  `dist/generated/prisma`. This Prisma-generated output under
  `src/generated/prisma` and `dist/generated/prisma` is committed and tracked
  — this file owns that generated-artifact convention. (The rest of `dist/`
  and its CI enforcement are owned by `deployment-operations.skill.md`.)
- Verify packaging after build changes:

```bash
test -f dist/generated/prisma/client.js
node -e "require('./dist/generated/prisma/client')"
```

## Schema Changes

Before any change: check whether the model/field already exists, read the
existing migrations, and create the migration before (or with) the application
code that needs it.

**Never run `prisma migrate dev` (or any migration command) against the URL in
`.env` — that URL may be Supabase, and no user instruction ("it's already set
up") changes this.** The only sanctioned target for creating or replaying
migrations is a disposable local PostgreSQL. This machine has no Docker/local
PG; use `npm install -D --no-save embedded-postgres`, boot a throwaway
instance, then stop it and `npm prune` afterwards.

- **Author** a new migration by pointing `DATABASE_URL` (and `DIRECT_URL` if
  used) at the disposable instance and running `prisma migrate dev --name <change>` there.
- **Replay** the committed chain with `prisma migrate deploy` against the
  disposable instance to verify it from scratch.

Never run against an unconfirmed database:

- `prisma migrate reset`
- `prisma db push`
- `prisma migrate deploy`
- `prisma migrate resolve`

Confirm the target first (`prisma migrate status`, read-only).

## Migration State — Derive, Don't Assume

The migration chain grows continuously; do not hardcode a migration count or
enumerate the chain in this file — it will go stale. Before any migration
work, derive the current state from repository evidence:

- `prisma/migrations/` — list the directories directly (`ls prisma/migrations`)
  to see the current chain and the most recent migration.
- `prisma migrate status` (read-only) against the target database.
- `prisma migrate diff` (read-only) for schema drift.
- CI's migration replay (`deployment-operations.skill.md`) as the
  ground-truth proof that the full chain applies cleanly from empty.

The chain originally required a **reconstructed baseline** migration
(`20260710000000_baseline`) because the two migrations that first created the
schema on the live database were never committed to `prisma/migrations/`. That
history, the baseline-reconciliation reasoning, and the original staging/
production resolve procedure are documented in
`docs/prisma-migration-reconciliation.md` — treat it as an accurate record of
**how the baseline and the first few migrations were reconciled**, not as a
current inventory of the full chain (re-verify its migration list against
`prisma/migrations/` before relying on any count or "N migrations" claim in
it).

- **Existing legacy-schema DB** (staging/prod): inspect `migrate status` +
  `migrate diff` first; proceed only if drift matches the expected deltas for
  that database's actual state. Leave the legacy `_init`/`_rename` rows alone;
  **never hand-edit `_prisma_migrations`**.
- **Empty DB**: `prisma migrate deploy` applies the full current chain. Do
  **not** run `migrate resolve` there.

## Verification

- Disposable-PostgreSQL replay of the full chain; final
  `migrate diff` (DB → schema) must be empty
- `npx prisma validate` && `npx prisma generate`
- `npx vitest run` && `npm run build` (+ packaging check above)

## Common Mistakes

- `new PrismaClient()` in a service/test instead of importing the singleton
  (fails anyway: the client engine requires an adapter).
- Running `migrate dev` "quickly" against `.env` — that URL points at Supabase.
- Running the baseline SQL on staging/prod (objects already exist) — baseline is
  reconciled with `resolve --applied`, never executed there.
- Renaming the baseline directory after it has been resolved anywhere.

---
name: agent-rules
description: Use when starting any task in the pocket-mint-be backend repository — before branching, editing code, running migrations, or claiming completion.
---

# Agent Rules — Pocket Mint Backend

Authoritative project workflow for this repository (Express 5 + TypeScript +
Prisma 7 + Supabase Postgres). Domain-specific invariants live in the skills
below; this file owns branching, verification, secrets, and load order.

## Skill Load Order

Always read this file first, together with `git-workflow.skill.md` (branching,
PR, and release process) before any task that touches git. Then read, **only
when the task touches that area**:

1. `authentication-security.skill.md` — auth, middleware, users, CORS, rate limiting
2. `financial-logic.skill.md` — wallets, transactions, transfers, installments, dashboard, reconciliation
3. `prisma-database.skill.md` — Prisma schema, migrations, generated client, pooling, DB deployment
4. `backend-api.skill.md` — routes, controllers, request DTOs, serializers, services
5. `deployment-operations.skill.md` — Railway, Supabase environments, CI/CD, migration rollout, secrets
6. `assistant-core.skill.md` — Assistant Core, entity resolution, Persistent Clarification Engine, Pending Financial Draft lifecycle

Do **not** load frontend UI skills. `.claude/archive/frontend/` is historical
reference only, never part of the load order.

## Git Branch Roles

- `main` = Production
- `dev` = Staging
- `master` = retired legacy branch — never use it for new work
- `feature/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*`, `test/*` = task branches
- `hotfix/*` = urgent production work, only when explicitly approved

Every task: `git checkout dev` → pull latest `dev` → create a task branch →
commit there → open a PR targeting `dev`. Full process, PR defaults, and the
release workflow live in `git-workflow.skill.md`.

Never:
- commit or push directly to `dev` or `main`
- target a PR at `main` without an explicit written release instruction

## Focus

- One task at a time. Inspect before creating — check whether the file,
  function, endpoint, or migration already exists.
- No unrelated refactors inside a task.
- When a task eventually affects the frontend, the backend endpoint/service
  comes first.
- Do not claim completion without evidence (command output).

## Verification

A backend task is done only when it passes the checks CI actually enforces —
typecheck, build, tests, `prisma validate`, and a clean tracked working tree
after building. See `deployment-operations.skill.md` for the exact CI steps
and `prisma-database.skill.md` for the Prisma-specific packaging check. Do not
claim completion without running these and showing the output.

## Secrets

Never:
- commit `.env` or `.env.local` (they are git-ignored; history already leaked
  once — do not repeat it)
- print tokens, DB passwords, JWT secrets, API keys, or connection URLs in
  output, logs, docs, or commit messages
- put real values in `.env.example` — placeholders only
- use Production credentials for Dev/Staging
- restore the retired `x-api-key` / `x-user-id` / `x-user-email` authentication

## Environment Isolation

- `dev` branch → Railway Staging → Supabase Dev project
- `main` branch → Railway Production → Supabase Production project (`master`
  is retired and unused)

Never mix these: no Production `DATABASE_URL` in staging, no staging JWT source
in production, no shared database between the two.

## Common Mistakes

- Committing on `dev` because "it's just a small fix" — always a task branch.
- Forgetting to rebuild and commit `dist/` after a `src/` change (CI diff check fails).
- Running a Prisma migration command against the `.env` database "to test" —
  see `prisma-database.skill.md`; use a disposable local PostgreSQL.
- Declaring done without running the verification commands.

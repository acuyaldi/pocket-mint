# Pocket Mint Backend — Agent Instructions

Express 5 + TypeScript + Prisma 7 (driver adapter) + Supabase Postgres.
JWT-only authentication. Deployed via Railway (staging = `dev`,
production = `main`; `master` is retired and unused).

Project workflow rules load automatically:

@.claude/skills/agent-rules.skill.md
@.claude/skills/git-workflow.skill.md

Read the matching domain skill before working in its area (paths relative to
repo root):

- `.claude/skills/git-workflow.skill.md` — branching, PR, and release process
- `.claude/skills/authentication-security.skill.md` — auth, middleware, users, CORS, rate limiting
- `.claude/skills/financial-logic.skill.md` — wallets, transactions, transfers, installments, dashboard, reconciliation
- `.claude/skills/prisma-database.skill.md` — Prisma schema, migrations, generated client, pooling, DB deployment
- `.claude/skills/backend-api.skill.md` — routes, controllers, DTOs, serializers, services
- `.claude/skills/deployment-operations.skill.md` — Railway, Supabase envs, CI/CD, migration rollout, secrets
- `.claude/skills/assistant-core.skill.md` — Assistant Core, entity resolution, Persistent Clarification Engine, Pending Financial Draft lifecycle

Frontend-era skills were archived to `.claude/archive/frontend/` and are not
part of the load order.

## Repository Reading Rules

- Read only files directly related to the current task.
- Do not perform repository-wide audits unless explicitly requested.
- Do not inspect dependencies, coverage, reports, logs, temporary files, or
  lockfiles unless they are directly required by the task.
- Treat `dist/` as generated build output: do not browse it routinely, but
  inspect or compare the specific generated files when the repository workflow
  requires artifact verification.
- Do not inspect generated Prisma client files routinely. Inspect only the
  specific generated file needed when debugging Prisma generation, imports, or
  runtime compatibility.
- Never skip `prisma/schema.prisma` or relevant migration files when working on
  database behavior.
- Prefer scoped `git diff`, `git grep`, and targeted path searches.
- Do not reread unchanged files already inspected in the current session.
- Run focused tests first; run the full suite only when required by the task,
  repository workflow, or final verification gate.
- Summarize command output and failures instead of reproducing complete logs,
  generated files, migration output, or large diffs.
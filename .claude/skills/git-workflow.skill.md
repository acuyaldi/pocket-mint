---
name: git-workflow
description: Use before creating branches, commits, or pull requests, and whenever the user says "create a PR", "release to production", "promote dev to main", or names a git base/head branch.
---

# Git Workflow — Pocket Mint Backend

Authoritative branch model and PR/release process for this repository. This
file is the single source of truth for branching; `agent-rules.skill.md` only
points here.

## Branch Model

- `dev` — development/integration branch and staging environment (Railway
  staging, Supabase Dev project). All normal work starts here.
- `main` — production/release branch (Railway production, Supabase Production
  project). Entered only through an explicitly approved release PR.
- `master` — retired legacy branch. Do not branch from it, target it, or use
  it for new work. Treat any lingering reference to it as historical.
- `feature/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*`, `test/*` — task
  branches, always cut from the latest `dev`.
- `hotfix/*` — only for urgent production work, and only when the user
  explicitly approves the hotfix workflow.

Direct pushes to `dev` or `main` are prohibited unless the user explicitly
authorizes them. Force push, reset, rebase of shared branches, and other
destructive branch operations require explicit user approval.

## Before Starting Any Task That May Create Commits

1. Confirm the repository root and run `git status`.
2. Fetch the latest remote state (`git fetch origin`).
3. Make sure the current work is not based on a stale branch.
4. Unless the user explicitly says otherwise, use `dev` as the base branch.

If already on a task branch with unmerged, unrelated work: do not silently
switch or mix tasks. Ask whether to finish, preserve, or abandon that branch
first.

## Starting Development Work

1. `git checkout dev`
2. `git pull` (or fast-forward) from `origin/dev`
3. Confirm the working tree is clean — if dirty, **stop and report the files**
   instead of stashing, discarding, or committing them without approval.
4. If `dev` cannot fast-forward cleanly, stop and report the divergence
   instead of forcing it.
5. Create a new branch from the latest `dev` with an appropriate prefix
   (never start ordinary work from `main`, never reuse an old task branch for
   unrelated work).

## "Create a PR" — Default Interpretation

When the user asks to "create a PR" without naming base/head branches:

- head = the current task branch
- base = `dev`

Before opening it:

- Verify the task branch was created from `dev`.
- Verify there are no unrelated commits or files (`git status`, diff against
  merge-base with `origin/dev`).
- Run the verification checks CI enforces (see `deployment-operations.skill.md`)
  plus the PR validation checklist below.
- Push the task branch and open the PR targeting `dev`.
- Never target `main` unless the user explicitly says this is a release PR.
- Never merge the PR unless the user explicitly asks.

### PR Validation Checklist

- `git status`
- Branch base and merge-base against `origin/dev`
- Commits in the task branch not in `dev`
- Changed files — no accidental secrets, `.env` files, generated artifacts,
  database dumps, or unrelated changes
- `tsc --noEmit` / `vitest run` / `npm run build`
- `prisma validate` and migration checks when Prisma is touched

There is no lint script or lint gate in this repository — do not require one.

### PR Content

Title uses a conventional prefix (`feat:`, `fix:`, `chore:`, `docs:`,
`refactor:`, `test:`). Description includes: purpose, summary of changes,
validation performed, risks or migration notes, base branch, and an explicit
note that the PR is not merged yet.

## After Creating a Normal Development PR

1. `git checkout dev`
2. `git fetch origin`
3. Fast-forward local `dev` to `origin/dev` when possible.
4. Leave the repository checked out on `dev`.
5. Do not delete the task branch unless the user explicitly requests cleanup.
6. Report: PR title, PR base, PR head, current checked-out branch, and
   whether the working tree is clean.

## Release Workflow ("create release PR" / "release to production" /
## "promote dev to main" / "create PR dev to main")

Only run this when the user explicitly requests a release, promotion, or a
`dev` → `main` PR. Head = `dev`, base = `main`.

Before creating it:

- Verify `dev` contains all intended work and the working tree is clean.
- Fetch both `dev` and `main`.
- Audit commits and file differences between them.
- Run full release validation (see below).
- Confirm no unintended commits are included.
- Do not create an intermediate release branch unless explicitly requested.
- Do not merge the release PR automatically.
- After creating it, return the local checkout to `dev`.

### Backend-Specific Release Validation

- All standard verification commands pass: `tsc --noEmit`, `npm run build`,
  `vitest run`, `prisma validate`, `git diff --check`.
- **Prisma migration and database rollout check**: confirm `prisma migrate
  status` / `migrate diff` against the target database before any rollout;
  see `prisma-database.skill.md` for the full procedure. Production migration
  must use `prisma migrate deploy` — never `prisma migrate dev` or `prisma db
  push` against production.
- Confirm environment documentation (`docs/deployment-runbook.md`) is current.
- Deployment stability status (e.g. PM-STAB-004) is tracked in
  `deployment-operations.skill.md` — check current status there before
  describing a release as fully validated; do not restate or contradict it
  here.

### Release PR Content

Must explicitly include: release candidate/version, included changes, test
evidence, migration status, deployment considerations, known issues,
remaining blockers, rollback reference or plan, and a statement that
production deployment is not complete until post-deploy validation passes.

## Main Branch Protections

- `main` is production. Never commit or push directly to it, never reset,
  rebase, force push, or rewrite it.
- Never create an ordinary feature/fix/chore PR targeting `main`.
- Changes enter `main` only through an explicitly approved release PR from
  `dev`, or an explicitly approved emergency hotfix workflow.

## Dev Branch Protections

- `dev` is the shared integration branch. No direct commits or pushes for
  normal work, no force push or rewrite.
- Normal work enters `dev` only through PRs from fresh task branches.
- After every PR creation, return the local checkout to `dev` so the next
  task starts from the correct base.

## Explicit Override

If the user explicitly names a different base or head branch than this
policy would use, follow their instruction — but warn first when it conflicts
with the branch model above (e.g. a PR targeting `main` that wasn't
requested as a release).

## Common Mistakes

- Committing on `dev` or `main` because "it's just a small fix" — always a
  task branch.
- Treating `master` as a valid target or base — it is retired.
- Opening a normal PR against `main` instead of `dev`.
- Staying on the task branch after a PR is created instead of returning to
  `dev`.
- Restating a deployment stability status (e.g. PM-STAB-004) here instead of
  deferring to `deployment-operations.skill.md`, the canonical owner.

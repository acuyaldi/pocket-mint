---
name: assistant-core
description: Use when working on Assistant Core (tool registry, policy, executor), entity resolution, the Persistent Clarification Engine, or the Pending Financial Draft lifecycle.
---

# Assistant Core — Pocket Mint Backend

## 1. Scope and Source of Truth

Reuse and extend the existing Assistant implementation. Do not build a
parallel tool registry, policy engine, executor, clarification mechanism, or
draft lifecycle — one already exists and is deterministic by design.

Relevant paths (verified against the current repository):

- `src/assistant/types.ts`, `registry.ts`, `policy.ts`, `executor.ts`,
  `tools.ts`, `errors.ts` — Assistant Core contracts and execution.
- `src/assistant/application.service.ts` — the top-level state machine
  (`createAssistantApplicationService`).
- `src/assistant/provider-runtime.ts` — LLM/provider boundary.
- `src/assistant/conversation.service.ts`, `conversation.types.ts` —
  conversation/turn persistence.
- `src/assistant/clarification.service.ts`, `clarification.types.ts` —
  Persistent Clarification Engine.
- `src/assistant/financial-draft.service.ts`, `financial-draft.ts` — Pending
  Financial Draft.
- `src/assistant/entity-resolution/` — wallet/merchant/category resolution.
- `src/controllers/assistant.controller.ts`, `src/routes/assistantRoutes.ts` —
  HTTP boundary.
- `docs/api/assistant-conversations.md` — accurate, detailed reference for
  the HTTP contract, TTLs, and error codes; consult it for endpoint-level
  detail this file doesn't repeat.

## 2. Architectural Boundary

The provider/LLM interprets natural language into a structured plan
(intent + arguments) or a clarification question — nothing more. The
application owns policy, entity resolution, clarification, draft
preparation, and financial execution, and that path is deterministic.

Verified in source:

- `executor.ts` states directly that the executor does **not** "plan, retry,
  compensate, draft, write, cancel, access Prisma, parse NL, create identity,
  or know about LLMs."
- `provider-runtime.ts`'s `sendMessage()` calls the provider only to produce
  a plan (validated by `validateAssistantPlan` in `provider-plan.ts`), then
  routes to `application.execute(...)` — the same deterministic path used by
  `POST /execute`.
- `policy.ts`'s `evaluatePolicy(tool)` is deterministic: static tool metadata
  only, risk tier alone never drives the action.

Never let provider/LLM output directly create a `Transaction`, skip policy
evaluation, or bypass entity resolution/clarification.

## 3. Existing Assistant Core

Reuse these exports; do not re-implement them:

- **Contracts** (`types.ts`): `ToolContract`, `ExecutionContext`,
  `PolicyResult`, `ToolExecutionResult`, `AssistantCanonicalRequest`,
  `AssistantCanonicalResponse` (union of Success/Clarification/
  Rejected/Error response types).
- **Registry** (`registry.ts`): class `ToolRegistry` — `register`, `get`,
  `listEnabled`, `size`; validates risk-tier/confirmation-policy invariants
  at registration time.
- **Policy** (`policy.ts`): `evaluatePolicy(tool: ToolContract): PolicyResult`.
- **Executor** (`executor.ts`): `executeTool(toolId, untrustedArgs, ctx, toolRegistry, handlerRegistry)`, types `ToolHandler`, `HandlerRegistry`.
- **Tools** (`tools.ts`): contracts `monthlySpendingSummary`,
  `transactionCreate`, plus their input types.
- **Errors** (`errors.ts`): `AssistantError` — private constructor, static
  factories only (`toolNotFound`, `policyDenied`, `draftConflict`,
  `clarificationExpired`, `clarificationAlreadyConsumed`,
  `idempotencyConflict`, `clarificationNotFound`, etc.). Use these factories,
  don't throw raw errors.
- **Application/state layer** (`application.service.ts`):
  `createAssistantApplicationService(deps)` → `{ execute,
  prepareProviderExecution, selectClarification, cancelClarification,
  getAssistantState }`.
- **Conversation persistence** (`conversation.service.ts`): `beginTurn`,
  `markTurnRunning`, `beginToolExecution`, `finalize`,
  `finalizeWithoutTool`, `finalizeRejected`, `establishConversation`,
  `assertContinuable`, `listOwnedConversations`, `getOwnedConversation`,
  `archiveOwnedConversation`.

## 4. Entity Resolution

Resolution order is **wallet → merchant → category → draft**, enforced in
`application.service.ts` (`executeTransactionCreate` /
`selectClarification`/`continueToCategory`).

- Deterministic, rule-first resolution: `entity-resolution/service.ts`
  (`createEntityResolutionService`), `matching.ts` (`matchEntityCandidate`,
  `confidenceFromEvidence`), and per-entity resolvers `wallet-resolver.ts`,
  `merchant-resolver.ts`, `category-resolver.ts` (each exports
  `create<X>Resolver(db)` implementing `EntityResolver.loadCandidates` /
  `matchCandidate`).
- Matching is exact/canonical/alias only — no fuzzy or embedding matching.
- Transaction-aware: every resolver's `loadCandidates(scope)` reads
  `scope.transaction` (type `EntityResolutionDbClient` in
  `entity-resolution/types.ts`) and falls back to the plain `db` client when
  absent (`const client = scope.transaction ?? db;`). The entry point is
  `resolveEntity(..., transaction?: TxClient)` in `application.service.ts`,
  fed `transaction: tx` from inside `clarification.runInTransaction`.

Reuse these resolvers and this pipeline order — don't add a second
resolution path or a fuzzy-matching layer. Detailed merchant/category domain
rules (naming, categorization) belong to the domain code itself, not this
skill.

## 5. Persistent Clarification Lifecycle

Models: `ClarificationRequest` (`id, userId, conversationId,
originatingTurnId, executionId [unique], parentId [self-relation
"ClarificationChain"], entityType, status
[PENDING/CONSUMED/CANCELLED/STALE], trustedContext, prompt, terminalCode,
restartRequired, expiresAt, consumedAt, cancelledAt`) and
`ClarificationOption` (`id, requestId, tokenDigest, displayLabel,
discriminator, candidateId`; `@@unique([requestId, tokenDigest])`).

- **Ownership**: every query filters by `userId` (and `conversationId`) in
  `clarification.service.ts`'s `select()`/`cancel()`; a wrong owner is
  indistinguishable from "not found" (`AssistantError.clarificationNotFound()`).
- **Parent-child chains**: `parentId` + relation `"ClarificationChain"`
  (`parent`/`children`), set via `parentClarificationId` when the next
  entity's clarification is created — this is how wallet → merchant →
  category clarifications sequence.
- **Continuation**: `selectClarification(userId, correlationId, token,
  conversationId, clarificationId?)` in `application.service.ts`, which calls
  `clarification.select(...)` inside `clarification.runInTransaction(...)`,
  then walks the remaining entities via `continueToCategory`.
- **Cancellation**: `cancel()` in `clarification.service.ts`, idempotent —
  cancelling an already-`CANCELLED` row is a no-op, not an error.
- **Only server-presented options are selectable** — selection is by
  `tokenDigest` match against a persisted `ClarificationOption`, never by an
  arbitrary client-submitted entity id.
- A failed continuation must remain retryable: see §8 below — the
  conditional claim rolls back with the rest of the transaction.

## 6. Token Safety

- The raw token is **never persisted**. `generateToken()` = `'clarify_' +
  randomBytes(32).toString('base64url')`, returned to the client exactly
  once at creation time (`ClarificationCreationProjection.options[].token`).
- Only the digest is stored: `digestToken(token) =
  createHash('sha256').update(token).digest('hex')` → `ClarificationOption.tokenDigest`.
- **One-time use / replay prevention**: an atomic conditional
  `updateMany({ where: { id: request.id, status: 'PENDING' }, data: {
  status: 'CONSUMED', consumedAt: now } })`. If `count !== 1`, it re-reads
  and throws the real terminal error instead of silently succeeding.
  `@@unique([requestId, tokenDigest])` additionally prevents duplicate option
  rows for the same digest.
- Never weaken this to a plain read-then-write, never persist the raw token,
  never skip the digest comparison.

## 7. Expiry

- Field: `ClarificationRequest.expiresAt`.
- Comparison uses **database time**, not the application process clock:
  `dbNow(client)` runs `SELECT to_char(now() AT TIME ZONE 'UTC', ...) AS
  "now"` via `$queryRaw`, then compares `request.expiresAt <= now`. This
  check exists identically in both `select()` and `cancel()`.
- TTL: `CLARIFICATION_TTL_MS = 15 * 60 * 1000` (15 minutes).
- Do not replace `dbNow` with `new Date()` for clarification expiry — that
  would desync from the database's clock. (Note: `AssistantFinancialDraft`
  expiry, by contrast, does use an injectable app-process `clock()` — that is
  the existing, intentional design for drafts; don't unify the two without
  explicit instruction.)

## 8. Atomic Continuation and Rollback Safety

- `selectClarification` wraps the claim, re-resolution, child-clarification/
  draft creation, and lifecycle persistence inside
  `clarification.runInTransaction(async (tx) => {...})`
  (`runInTransaction` = `existing ? work(existing) : db.$transaction(work)`).
- A failed continuation rolls back the whole transaction, including the
  `PENDING → CONSUMED` claim — the clarification is not falsely consumed and
  the token remains retryable.
- **Advisory locking** is used specifically in `financial-draft.service.ts`'s
  `confirm()`/`cancel()`: `pg_advisory_xact_lock(hashtextextended(draftId, 0))`,
  a transaction-scoped Postgres lock keyed on `draftId`. Clarification
  `select()`/`cancel()` do not use an advisory lock — their concurrency
  safety comes purely from the conditional `updateMany` claim.
- **Unique-conflict handling**: draft `confirm()` catches Prisma `P2002` on
  `AssistantIdempotencyRecord`'s `@@unique([userId, key])` and re-checks the
  record to distinguish idempotent replay from a genuine conflict
  (`AssistantError.idempotencyConflict()`). There is no automatic retry loop
  anywhere in this path — retry is caller-driven.
- Do not remove the advisory lock, the `P2002` handling, or the conditional
  claim pattern — they are the actual concurrency-safety mechanisms in place.

## 9. Pending Financial Draft

Model: `AssistantFinancialDraft` (`id, userId, conversationId,
originatingTurnId, originatingExecutionId [unique], status
[PENDING_CONFIRMATION/COMMITTED/CANCELLED/EXPIRED/FAILED], operation,
transactionType, amount, walletId, categoryId, transactionDate, description?,
expiresAt, committedAt?, cancelledAt?, failedAt?, transactionId [unique,
nullable]`). TTL: `ASSISTANT_FINANCIAL_DRAFT_TTL_MS = 15 * 60 * 1000`.

- A draft is **not** a `Transaction`: `prepare()` only calls
  `assistantFinancialDraft.create(...)` — it never touches the `Transaction`
  model or a wallet balance. No balance change occurs merely because a draft
  exists.
- **Confirmation**: `confirm(userId, draftId, keyValue, correlationId)` in
  `financial-draft.service.ts` claims the draft
  (`updateMany({ where: { ..., status: 'PENDING_CONFIRMATION', transactionId:
  null }, data: { status: 'COMMITTED', ... } })`) and, inside the same
  transaction, calls the canonical transaction service:
  `transactions.createTransaction({ userId, type: draft.transactionType,
  amount: draft.amount, walletId: draft.walletId, categoryId:
  draft.categoryId, date: draft.transactionDate.toISOString(), description:
  draft.description ?? undefined }, { transaction: tx })`. It never
  reimplements balance mutation, credit-limit checks, or installment
  creation itself — see `financial-logic.skill.md` for those invariants.
- Duplicate/replay confirmation is prevented by the claim above plus the
  idempotency-record `P2002` handling in §8.
- HTTP: `POST /drafts/:draftId/confirm`, `POST /drafts/:draftId/cancel`.

## 10. HTTP Endpoints

All routes in `src/routes/assistantRoutes.ts` require `requireUser`;
mutating routes additionally run `mutationLimiter`:

| Method | Path | Controller |
|---|---|---|
| POST | `/execute` | `assistantExecute` |
| POST | `/messages` | `assistantMessages` |
| GET | `/conversations` | `listAssistantConversations` |
| GET | `/conversations/:conversationId` | `getAssistantConversation` |
| POST | `/conversations/:conversationId/archive` | `archiveAssistantConversation` |
| POST | `/drafts/:draftId/confirm` | `confirmAssistantFinancialDraft` |
| POST | `/drafts/:draftId/cancel` | `cancelAssistantFinancialDraft` |
| POST | `/conversations/:conversationId/clarifications/:clarificationId/select` | `selectAssistantClarification` |
| POST | `/conversations/:conversationId/clarifications/:clarificationId/cancel` | `cancelAssistantClarification` |

- Ownership is checked on every route (§5, §9).
- Clients may only select a server-presented clarification option
  (matched by token, §6) — never accept an arbitrary client-supplied
  resolved-entity id as a substitute, unless a specific existing endpoint
  explicitly documents that behavior.
- See `docs/api/assistant-conversations.md` for full request/response
  shapes and error codes.

## 11. Cross-Skill Ownership

- Authentication/ownership mechanics → `authentication-security.skill.md`.
- Transaction/balance invariants, draft → confirmation → canonical
  transaction creation → `financial-logic.skill.md`.
- Database/transaction mechanics → `prisma-database.skill.md`.
- Route/controller/response conventions → `backend-api.skill.md`.
- CI/deployment behavior → `deployment-operations.skill.md`.

This file does not restate their detailed rules.

## 12. Prohibited Regressions

- Bypassing explicit user confirmation before a draft becomes a `Transaction`.
- Creating a `Transaction` directly from provider/LLM interpretation output.
- Persisting a raw clarification token instead of its digest.
- Using application-process time instead of `dbNow()` for clarification
  expiry.
- Accepting an arbitrary client-supplied entity selection instead of a
  server-issued, token-matched clarification option.
- Building a parallel `ToolRegistry`, policy evaluator, or executor instead
  of extending the existing one.
- Bypassing the `userId`/`conversationId` ownership filter on any
  clarification, draft, or conversation query.
- Moving clarification continuation or draft confirmation outside their
  established `$transaction` boundary.
- Marking a clarification `CONSUMED` (or a draft `COMMITTED`) before the
  downstream work in the same transaction actually succeeds.
- Re-implementing wallet/merchant/category resolution instead of reusing
  `entity-resolution/`.

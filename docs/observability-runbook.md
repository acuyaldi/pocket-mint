# Assistant observability runbook

Operational runbook for debugging Assistant Core requests using structured
logs. Companion to [`docs/api/assistant-conversations.md`](./api/assistant-conversations.md)
(HTTP contract) and `.claude/skills/assistant-core.skill.md` §13
(Observability — field/event reference for implementers).

No secret values appear in this document. Logs referenced here contain
operational metadata only — never user messages, Assistant responses,
financial amounts, wallet/category/merchant names, tokens, or idempotency
keys. See §5 for the redaction boundary.

---

## 0. Quick reference

| | |
| --- | --- |
| **Log format** | Single-line JSON via `src/utils/logger.ts` (`logger.info/warn/error`, `logEvent`). Written to stdout/stderr — Railway captures both as the log stream. |
| **Correlation ID** | `req.correlationId`, generated fresh per request in `src/http/correlation.ts`, returned as `X-Correlation-Id` response header, logged as `requestId` on every event. |
| **Event taxonomy** | `assistant.message.*`, `assistant.provider.*`, `assistant.tool.*`, `assistant.draft.*`, `assistant.clarification.*`, `assistant.recovery.*` — see `.claude/skills/assistant-core.skill.md` §13. |
| **Error classification** | `errorCategory` field, computed by `src/utils/errorCategory.ts#categorizeError`, present on every `request error` log line and on failed lifecycle events. |
| **Metrics** | Log-based only — no metrics backend is connected. Derive counters/histograms by aggregating `event`/`durationMs`/`errorCategory` fields from the Railway log stream (or an export of it). No `/metrics` endpoint exists. |

---

## 1. Tracing a failed Assistant request by request ID

1. Get the `X-Correlation-Id` response header from the failed client call (or
   the `requestId` field in the JSON error body — same value).
2. Search the Railway log stream for that value. Every log line for the
   request — lifecycle events and the terminal `request error` line — carries
   it as `requestId`.
3. Read the lifecycle in order: `assistant.message.received` →
   (`assistant.provider.*` / `assistant.tool.*` as applicable) →
   `assistant.message.completed` or `.failed`. The last event before a gap is
   where the request stopped making progress.
4. The terminal `request error` line (from `error.middleware.ts`) carries
   `statusCode`, `code`, and `errorCategory` — use `errorCategory` first; it's
   the bounded, low-cardinality signal. `code`/`statusCode` add HTTP-contract
   detail if needed.

## 2. Investigating a provider timeout or rate limit

- Look for `assistant.provider.failed` with `errorCategory: "provider_timeout"`
  or `"provider_rate_limit"`.
- `assistant.provider.started` → `.failed` `durationMs` shows how long the
  call ran before failing. The provider has retries disabled
  (`attempts: 1` in `gemini.provider.ts`) — a timeout here is a single-attempt
  failure, not an exhausted-retry failure.
- These are provider-side conditions; there is no prompt/response content in
  the log to inspect — the taxonomy is deliberately silent on what was asked
  or returned. If failures cluster, check the upstream provider's own status
  page/dashboard, not this log stream.

## 3. Investigating draft-confirm ambiguity ("did my confirm land?")

- Search for `assistant.draft.confirmed` with the request's `requestId`.
- `idempotencyOutcome` distinguishes the four real backend outcomes:
  - `"new"` — this call created the transaction.
  - `"replay"` — a transaction already existed for this idempotency key; no
    new mutation occurred.
  - `"conflict"` — the idempotency key was already bound to a *different*
    draft (`errorCategory: "idempotency"`, HTTP 409).
  - `"expired"` — the draft passed its TTL before confirmation
    (`errorCategory: "expired"`, HTTP 409).
- If the client never received a response (network/timeout on the client
  side) but a server-side `assistant.draft.confirmed` event exists with
  `idempotencyOutcome: "new"`, the mutation happened — the client should
  retry with the **same** `Idempotency-Key` to get the durable replayed
  result, never a fresh confirm without one.

## 4. Confirming whether idempotent replay occurred

Same signal as above: `idempotencyOutcome: "replay"` on
`assistant.draft.confirmed`, or `errorCategory: "idempotency"` on a
terminal `request error` line for a conflicting key. The raw idempotency key
is never logged — correlate by `requestId` and draft confirm timing instead.

## 5. Investigating clarification expiry or already-consumed errors

- `errorCategory: "expired"` → the clarification's 15-minute TTL passed
  (`ASSISTANT_CLARIFICATION_EXPIRED`/`STALE`); the client must restart the
  flow, there is no server-side recovery for an expired clarification token.
- `errorCategory: "already_consumed"` → the token was already used (one-time
  use enforced by an atomic claim in `clarification.service.ts`); a client
  retry with the same token will never succeed — this is expected replay
  protection, not a bug.
- `assistant.clarification.selected`/`.cancelled` events carry `outcome`
  (the response status) and `httpStatus` for the same request.

## 6. Identifying CORS or client-side transport failure vs. a backend terminal failure

- If there is **no** `assistant.message.received` event for a `requestId` the
  client believes it sent, the request never reached the backend — check CORS
  configuration (`CORS_ALLOWED_ORIGINS`) or client-side network/abort
  behavior. This is not a backend bug.
- If `assistant.message.received` exists but no `.completed`/`.failed`
  follows, the process may have crashed or been redeployed mid-request —
  check Railway deploy history around that timestamp.
- If both `.received` and `.failed` exist, the failure is a real backend
  terminal failure — proceed via §1.

## 7. Investigating recovery-state failures

- `GET /conversations/:id/recovery-state` emits `assistant.recovery.requested`
  then `.resolved` (something recoverable was found) or `.unresolved`
  (nothing pending, or the lookup itself failed — check `errorCategory` on
  that event to tell the two apart).
- `hasActiveClarification` / `hasPendingDraft` / `hasTerminalClarification`
  are presence-only booleans — never log or expect the underlying
  clarification/draft content here.

## 8. Deployment/configuration checks

- Confirm `NODE_ENV=production` in Railway — this gates stack traces out of
  both the client response and the server log (`error.middleware.ts`).
- **Prisma query logging** (`src/lib/prisma.ts`): enabled only when
  `NODE_ENV=development` (`log: ['query', 'warn', 'error']`); production and
  staging use `['error']` only. If this is ever changed, note that Prisma's
  own `query` log writes raw SQL parameters directly to stdout — **it does
  not pass through `redact()`** and would be a real sensitive-data leak path
  (financial amounts, entity IDs) if enabled outside development. Do not
  change this without also routing Prisma's log events through the app
  logger's redaction.
- No metrics backend or `/metrics` endpoint is deployed — see §0.

---

## Redaction boundary (for reference)

Never present in any Assistant log line: user message text, Assistant
response text, clarification option labels/values, clarification tokens,
draft payloads, transaction amounts, merchant/wallet/category names,
idempotency keys, JWTs, or provider prompts/completions. Enforced by:
`src/utils/logger.ts`'s `AssistantLogEvent` type (compiler-level allowlist for
`logEvent`) plus `redact()` (runtime key-fragment blocklist backstop on every
log call, including plain `logger.*` calls elsewhere in the codebase).

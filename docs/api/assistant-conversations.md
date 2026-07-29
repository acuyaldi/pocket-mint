# Assistant Conversations API

All endpoints are authenticated under `/api/v1/assistant`. Identity always comes from verified request context; clients cannot provide an owner ID. The canonical `/execute` API remains deterministic and intent-first. Phase 21.6 adds one explicitly configured natural-language provider path without changing that existing behavior.

## Natural-language messages

`POST /messages` accepts:

```json
{
  "conversationId": "optional public conversation identifier",
  "message": "natural-language user request"
}
```

Unknown fields, empty messages, non-string values, and messages above the canonical 10,000-character limit are rejected. The standard success/error envelope is unchanged. Successful data is one of the existing deterministic execution/draft responses, `{ "status": "clarification_required", ... }`, or `{ "status": "unsupported", ... }`. Machine-readable clarification responses use an explicit `data.kind` discriminator: `entity_selection`, `guided_fields`, or `provider_text`. Provider availability, timeout, rate-limit, configuration, refusal, and invalid-response failures use safe `ASSISTANT_PROVIDER_*` codes; no prompt, context, raw response, SDK error, request header, vendor request ID, usage detail, or credential is returned.

The endpoint exists even when provider execution is disabled, but returns `ASSISTANT_PROVIDER_UNAVAILABLE` without making an external call. Enablement requires `ASSISTANT_PROVIDER=gemini`, `ASSISTANT_MODEL`, and `GEMINI_API_KEY`; `ASSISTANT_PROVIDER_TIMEOUT_MS` defaults to 15,000 ms. Missing required enabled configuration fails startup. Normal tests and the canonical `/execute` path need no provider key.

The request lifecycle deliberately uses Phase 21.5 option A. The backend establishes or ownership-validates the conversation, calls `prepareProviderExecution` with the still-unpersisted current request, assembles one labelled provider payload, and invokes Gemini outside every Prisma transaction. Only after the structured plan validates does the existing application service persist the USER message and execute the registered intent. Clarification, unsupported, and provider-failure paths also begin exactly one turn and persist that USER content once. The current request therefore appears once in provider context and once in durable history, never twice in either.

The system instruction and capability catalog are deterministic for identical registry state. The catalog is generated from enabled registered tools and exposes only intent, description, safe argument contract, capability category, and whether confirmation may be required. History, tool summaries, draft previews, wallet/category names, descriptions, and current input are labelled untrusted data outside the system rules. Model output must match a strict closed JSON schema; unknown intents/fields, ownership or lifecycle claims, reasoning fields, prototype keys, arrays where objects are required, depth above six, and serialized output above 32 KiB are rejected.

Backend-generated text remains authoritative for known intent results, errors, unsupported behavior, and draft previews. Provider text is used only for one bounded plain-text clarification question (500 characters). Secret-seeking wording, links, executable markup, control characters, and non-terminal provider responses are replaced or rejected safely. Provider `userMessage` text never replaces a deterministic transaction, balance, or draft result.

For `transaction.create`, the provider plan must supply textual `walletReference`, `merchantReference`, and `categoryReference` values. It cannot supply `walletId`, `categoryId`, category identifier variants, `merchantId`, `merchantMappingId`, ownership/type claims, trusted constraints or aliases, resolution evidence/confidence, authorization/confirmation claims, or lifecycle claims. Unknown and Unicode-confusable prohibited keys are rejected. The Backend resolves the wallet against only the authenticated User's active wallets, the merchant against only that User's Merchant Mapping rows, and the category against only that User's categories of the trusted transaction type. Internal wallet, Category, and Merchant Mapping IDs never enter the provider-visible contract or public ambiguity options.

A unique wallet and category resolution creates a 15-minute `PENDING_CONFIRMATION` draft and returns a deterministic preview with safe display labels. Wallet or Category ambiguity/absence blocks draft creation. Merchant ambiguity also blocks draft creation, but merchant `not_found` does not: because the transaction model has no standalone merchant field or Merchant entity, the validated normalized reference continues as inert free-form merchant text. It becomes `Transaction.description` only when the request did not already include an explicit description; an explicit description remains authoritative and the merchant label is preview-only. An explicit `categoryReference` never falls back to Merchant Mapping category data or Smart Categorization keywords. The initial natural-language request creates no transaction and changes no wallet balance. The model cannot call, select, or simulate confirmation; only the separate authenticated `/drafts/:draftId/confirm` endpoint with an explicit idempotency key may commit.

Provider audit uses the dedicated `AssistantProviderExecution` record rather than overloading tool execution. It stores provider/model identifiers, lifecycle status, correlation/conversation/optional turn references, duration, byte counts, normalized finish class, safe error code, and optional neutral token totals. It has no prompt, context, message, arguments, raw request/response, hidden reasoning, credential, header, or raw SDK error fields. The official `@google/genai` adapter sends one request with SDK retries disabled, caps model generation at 4,096 output tokens, and applies client cancellation plus the configured HTTP timeout. The 32 KiB byte check remains a post-SDK validation boundary because the non-streaming SDK materializes its response before returning.

Provider-generated bounded questions and deterministic no-option retry prompts remain typed as provider text:

```json
{ "status": "clarification_required", "message": "...", "data": { "kind": "provider_text" } }
```

Missing transaction `amount` stays in this provider-text path. Wallet/category `not_found` prompts also use this shape because there are no backend-issued options to select. There is no guided amount field in this phase because arbitrary amounts have no backend-authoritative option set.

The provider-audit row is created before the external call. Its terminal update occurs only after the corresponding deterministic/non-tool result is durable. If that metadata-only update fails, the API returns the already-durable result instead of turning a committed draft into a retry-triggering error; the audit row can remain `STARTED` for manual investigation because this phase has no recovery worker.

`POST /messages` has no request-idempotency contract. Each HTTP request invokes the provider at most once and executes a deterministic capability at most once, but two independent or concurrent duplicate submissions are two requests and may create two turns and two pending drafts. Confirmation idempotency is scoped to one draft and does not deduplicate draft creation.

## Execute

`POST /execute` accepts `message?`, canonical `intent`, `arguments`, `conversationId?`, and `locale?`. `MAX_ASSISTANT_MESSAGE_LENGTH` is 10,000 characters for every canonical USER or ASSISTANT message, independently of the HTTP body limit. Empty or whitespace-only user messages are absent. Oversized user input returns a safe validation error before any conversation, turn, message, or tool-execution row is created; input is never truncated. When a message is absent, the backend persists a fallback constructed only after arguments validate. Deterministic output and persistence-service writes are checked against the same limit. Successful and post-resolution error responses contain `conversationId`, `turnId`, and the server-generated `correlationId`.

Unknown and cross-user conversation IDs return the same not-found response. Archived or expired conversations cannot be continued.

## List and history

- `GET /conversations?page=1&limit=20`
- `GET /conversations/:conversationId?page=1&limit=20`

Pagination defaults to 20 and caps at 100. Lists contain owned summaries only. History returns stable chronological canonical messages with plain-text `content` and `source`, allowing clients to distinguish original input, canonical fallback, safe request summary, deterministic output, and safe errors. Owner IDs, audit JSON, provider payloads, stack traces, and database internals are omitted.

Unsupported intents and malformed arguments establish a durable rejected turn with constant safe USER and ASSISTANT messages, but never create a tool-execution row or invoke a finance-domain handler. Raw unvalidated arguments are not persisted.

A `RUNNING` turn is durable execution state, not evidence that a process is still active and not a completed response. If a tool succeeds but final persistence does not, the API does not return success and retrieval continues to show the incomplete `RUNNING` lifecycle. Phase 21.3 does not retry, reconcile, or automatically recover stale records. Correlation IDs on structured logs and lifecycle records support investigation; raw financial results are not logged. Mutation retry remains forbidden until Phase 21.4 provides idempotency.

## Archive

`POST /conversations/:conversationId/archive` is ownership-scoped and idempotent. It does not delete messages, execution history, or finance data. Phase 21.3 has no permanent deletion or automatic expiration job.

Assistant records are historical snapshots of what was presented. Finance-domain tables remain authoritative current truth.

## Financial transaction drafts

`POST /execute` also accepts the allow-listed `transaction.create` intent. Its arguments are `type` (`INCOME` or `EXPENSE`), positive decimal `amount` with at most two fraction digits, optional `date` (`YYYY-MM-DD`), optional `description` (maximum 500 characters), optional `merchantReference` for deterministic internal compatibility, exactly one of `walletReference` or `walletId`, and optional `categoryReference` or compatibility `categoryId`. Provider plans require textual `walletReference` and may omit textual `categoryReference` and `date`; those omissions create a persisted guided-fields clarification after wallet/merchant resolution. Provider plans expose neither compatibility ID. `walletId` and `categoryId` are retained only for legitimate deterministic callers. Both category forms, unknown fields, identifier variants, both wallet forms, merchant/mapping identifiers, transfers, installments, ownership/type/authorization/confirmation claims, balances, categorization authority/confidence, resolution evidence, trusted constraints, lifecycle fields, and prototype keys are rejected. The Assistant capability remains closed to `TRANSFER`; it supports only `INCOME` and `EXPENSE`, so a transfer cannot supply or resolve a category through this contract.

Wallet resolution applies authenticated owner scope and `isArchived: false` in the database query. Exact canonical names, normalized names, and bounded aliases derived from trusted wallet-name metadata are supported. There is no fuzzy, substring-scored, embedding, semantic, or provider-confidence path. An ambiguous response contains safe display labels, optional wallet-type discriminators, deterministic confidence, and evidence, but no internal option IDs. Unknown, archived, ineligible, and cross-user-only wallets all return the same `not_found` resolution class. These outcomes create no financial draft or mutation.

A resolved wallet continues through the existing owner-scoped wallet/category validation and creates only an `AssistantFinancialDraft`; it never creates a transaction or changes a wallet balance.

Merchant resolution uses `MerchantMapping` because the schema has no standalone `Merchant` model. Its query applies `userId = authenticatedUserId` before candidate materialization and selects only mapping ID, display `merchantName`, and trusted `normalizedMerchant`. The mapping ID remains internal and is not persisted to the draft or transaction. `normalizedMerchant` is the only trusted alias source; arbitrary transaction history and provider output are never aliases. There is no global merchant data, lifecycle state, automatic merchant/mapping creation, alias learning, substring/fuzzy/semantic matching, or resolution write.

Merchant Mapping remains authoritative only for its existing `merchantName → categoryId` purpose. Merchant Resolver uses its trusted name representation but does not copy or override `categoryId`. The existing advisory categorization behavior remains unchanged: Merchant Mapping precedes keyword suggestions, explicit/manual category input remains authoritative, and the reserved Rule Engine stage is not implemented or modified by Phase 22.3.

Category resolution queries only `Category` rows whose `userId` is the authenticated User and whose `type` equals the backend-owned `INCOME` or `EXPENSE` transaction type. It selects only ID, name, and type, takes at most 101 rows, and fails closed when more than 100 eligible candidates exist. `Category.name` is both canonical and safe display text; there are no aliases. Matching uses only the Phase 22.1 NFKC canonical and normalized exact rules. It does not seed default categories, read Merchant Mapping category IDs, read Smart Categorization keywords, scan transaction history or budgets, or perform a write. Consequently, a User whose private lazy defaults have never been seeded can receive `not_found`.

Category `ambiguous` returns bounded safe names and optional type discriminators with no Category IDs. `not_found` covers missing, wrong-type, cross-user-only, and unseeded categories without revealing which case occurred. Both outcomes create no draft, Transaction, or wallet-balance change. Compatibility `categoryId` bypasses textual resolution but is revalidated for authenticated ownership and transaction-type compatibility by draft preparation and again by the existing Transaction Service at confirmation.

The success data contains `draftId`, `PENDING_CONFIRMATION` status, `expiresAt`, normalized `preview`, and `confirmationRequired: true`. During its existing owner/type validation query, draft preparation selects the authoritative Category name. Structured and rendered previews expose that name and never expose Category ID; the ID is stored only in the pending draft for later confirmation. The persisted plain-text preview is deterministic and states that explicit confirmation is required. Drafts expire after 15 minutes. Expiration is enforced on confirmation/cancellation even though automatic cleanup is deferred.

- `POST /drafts/:draftId/confirm` requires an `Idempotency-Key` header containing 1–128 ASCII letters, digits, `_`, `.`, `:`, or `-`.
- `POST /drafts/:draftId/cancel` is idempotent while the draft is cancelled.

Confirmation locks the draft in PostgreSQL, checks the database-unique `(userId, key)` record, invokes the existing transaction service inside the same Prisma transaction, links the authoritative transaction, and commits the draft plus the confirmation turn/audit summary atomically. Exact key replay and a different key on an already committed draft return the original committed transaction without another financial effect. Reusing a key for another draft returns `ASSISTANT_IDEMPOTENCY_CONFLICT`. Cancellation of a committed draft and confirmation of cancelled, expired, or failed drafts return a conflict. Unknown and cross-user drafts share the same not-found response.

Audit JSON contains only draft/operation/status and, after commit, transaction ID. Raw draft payloads, wallet objects, balances, request bodies, and internal errors are excluded. Authoritative transactions referenced by committed drafts or successful idempotency records are protected by restrictive foreign keys; deleting Assistant history never cascades to a transaction.

If the finance domain rejects confirmation, its transaction is rolled back before any financial mutation or idempotency success can persist. Recording the separate durable rejection history is best-effort: a secondary persistence failure can leave the draft pending, but the API returns no false success and performs no automatic retry. A later explicit retry remains subject to the same lifecycle and idempotency checks. No frontend, external channel, provider failover, tool loop, recovery worker, or stale-draft cleanup worker is part of this phase.

## Clarification selection and cancellation

When wallet, merchant, or category resolution returns `ambiguous` during `transaction.create`, the Backend persists a `ClarificationRequest` with up to five bounded, deterministically ordered options and returns one freshly issued, cryptographically random token per option. Each token is returned exactly once, at creation. Only its SHA-256 digest is stored; the raw token is never persisted, logged, or reconstructable, so a lost token cannot be recovered or reissued — the User must restart from a new ambiguous request.

Entity selection response shape:

```json
{
  "status": "clarification_required",
  "message": "...",
  "data": {
    "kind": "entity_selection",
    "entityType": "wallet",
    "clarification": {
      "clarificationId": "...",
      "entityType": "wallet",
      "prompt": "...",
      "options": [{ "token": "clarify_...", "label": "BCA", "discriminator": "BANK" }],
      "expiresAt": "..."
    }
  }
}
```

When `transaction.create` is otherwise valid but category and/or date is missing, the Backend persists a guided-fields `ClarificationRequest` in the same engine. The frontend may render only the fields the Backend includes. Category values submitted from this guided path are untrusted text and are resolved again server-side; the client never submits a Category ID. Date values are validated as calendar days before the clarification is consumed. A guided clarification creates no draft until all required fields have been validated/resolved.

Guided fields response shape:

```json
{
  "status": "clarification_required",
  "message": "...",
  "data": {
    "kind": "guided_fields",
    "clarification": {
      "kind": "guided",
      "clarificationId": "...",
      "fields": [
        { "field": "category", "required": true, "input": { "type": "text", "placeholder": "Nama kategori" } },
        { "field": "date", "required": true, "input": { "type": "date" } }
      ],
      "expiresAt": "..."
    }
  }
}
```

- `POST /assistant/conversations/:conversationId/clarifications/:clarificationId/select`
- `POST /assistant/conversations/:conversationId/clarifications/:clarificationId/cancel`

Both routes require an authenticated User and are scoped to that User's own conversation and clarification; an unknown clarification, a clarification owned by another User, and a clarification belonging to a different conversation all return the same `ASSISTANT_CLARIFICATION_NOT_FOUND` response, so ownership and conversation binding are never distinguishable from "not found."

### Select

For entity selection, the request body accepts exactly one key:

```json
{ "optionToken": "clarify_<opaque-example-token>" }
```

Any other shape — a missing key, an additional key, an empty or non-string `optionToken`, an array, or a non-plain-object body — is rejected with `400 BAD_REQUEST` before the token is ever compared against stored digests. Selection is deterministic-only: there is no candidate ID, index, or natural-language selection path.

For guided fields, the same route accepts exactly one `fields` object:

```json
{ "fields": { "categoryReference": "Food", "date": "2026-07-29" } }
```

`fields.date` must be a valid `YYYY-MM-DD` calendar day. `fields.categoryReference` or `fields.category` is treated as untrusted text and resolved through the existing owner-scoped category resolver. Invalid guided field values are rejected before the clarification is consumed, so the User can correct and retry while the request is still pending.

Lifecycle and expiry are resolved from database time before the supplied token is hashed and matched, so an already-terminal or expired clarification never reveals whether the token would otherwise have matched. A non-`PENDING` clarification returns its specific terminal outcome instead of a generic error:

| Condition | HTTP status | Code |
|---|---:|---|
| Clarification not found, not owned, or conversation mismatch | 404 | `ASSISTANT_CLARIFICATION_NOT_FOUND` |
| Token does not match any option on this clarification | 400 | `ASSISTANT_CLARIFICATION_INVALID_OPTION` |
| Already selected | 409 | `ASSISTANT_CLARIFICATION_ALREADY_CONSUMED` |
| Already cancelled | 409 | `ASSISTANT_CLARIFICATION_CANCELLED` |
| Past its 15-minute expiry | 409 | `ASSISTANT_CLARIFICATION_EXPIRED` |
| Terminalized for another reason (e.g. a stored context that no longer parses) | 409 | `ASSISTANT_CLARIFICATION_STALE` |
| Trusted context failed structural validation | 409 | `ASSISTANT_CLARIFICATION_CONTEXT_INVALID` |
| Entity type is no longer one the continuation path recognizes | 409 | `ASSISTANT_CLARIFICATION_CONTINUATION_INVALID` |

A valid, still-pending token atomically claims the clarification (`PENDING → CONSUMED`) and revalidates the selected candidate and any already-resolved prerequisite (wallet, then merchant) under the authenticated User's current ownership before continuing. A successful selection returns one of two safe shapes:

```json
{ "status": "clarification_required", "data": { "kind": "entity_selection", "entityType": "merchant", "clarification": { "clarificationId": "...", "prompt": "...", "options": [{ "token": "...", "label": "..." }], "expiresAt": "..." } } }
```

```json
{ "status": "success", "data": { "draftId": "...", "status": "PENDING_CONFIRMATION", "preview": { "...": "..." } } }
```

The first shape means the wallet → merchant → category sequence has another ambiguity: a new child clarification is created with its own fresh 15-minute expiry and its own tokens (the parent's expiry is never extended), and the original immutable context (amount, type, date, description) carries forward unchanged. The second shape means every entity is now resolved and a `PENDING_CONFIRMATION` draft was prepared; explicit confirmation through `POST /drafts/:draftId/confirm` remains the only path to the Transaction Service — selection itself never creates a Transaction or changes a wallet balance. The provider is never re-invoked during continuation.

The atomic claim, prerequisite/candidate revalidation, child-clarification-or-draft creation, and Assistant lifecycle persistence all run inside the same interactive database transaction. If any downstream step fails, the entire transaction — including the claim — rolls back, so the clarification remains `PENDING` and the same token can be retried safely. No raw token, token digest, internal candidate ID, or trusted-context field appears in any response, error, or log.

### Cancel

The cancel body must be empty (`{}` or no body); any key is rejected with `400 BAD_REQUEST`. Cancellation is idempotent: cancelling an already-cancelled clarification returns the same success response rather than a conflict. Cancelling a clarification that is already `CONSUMED`, `STALE`, or expired returns its existing terminal outcome using the same status/code table as select. A successful cancellation returns:

```json
{ "status": "success", "data": { "clarificationId": "...", "status": "CANCELLED" } }
```

Cancelling creates no child clarification and no draft.

### Conversation state and recovery

The bounded `assistantState` projection returned with conversation reads exposes at most one active clarification (safe labels and optional discriminators only — no tokens, digests, or candidate IDs), one pending draft preview, and the most recent terminal clarification outcome (status and `terminalCode` when applicable). If a User loses an issued option token, conversation state cannot recover or reissue it; the only path forward is cancelling (or waiting for expiry) and letting a new request re-resolve the ambiguity from scratch.

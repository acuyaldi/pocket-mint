---
name: backend-api
description: Use when adding or modifying routes, controllers, request parsing, serializers, response shapes, or command/query services in this backend.
---

# Backend API — HTTP Boundary & Service Layer

## Purpose

Keep the layering that the codebase already follows:

```
route → auth middleware (requireUser / requireVerifiedJwt)
      → thin controller (HTTP mapping only)
      → command/query service (Express-free)
      → domain helpers (src/domain/*)
      → Prisma (src/lib/prisma singleton)
```

Architecture docs: `docs/architecture-http-boundary.md` and the per-module
`docs/architecture-*-service.md` files.

## Rules

- **Controllers** own HTTP mapping, request-field allowlisting, serializers
  (Decimal → number via `parseFloat(v.toString())` at the boundary only),
  response messages, and error forwarding. No Prisma business orchestration in
  controllers.
- **Services** are Express-free: no `req`/`res`, no headers, no status codes.
  They take typed inputs (`*.types.ts`) and throw typed operational errors
  (`*.errors.ts` with `isOperational`, `statusCode`, `code`).
- **Identity**: read only the canonical `req.auth` via
  `getAuthenticatedUserId(req)` from `src/http/authContext.ts`. Never trust a
  user id from body, query, or any custom header.
- **Query params**: use `scalarString` / `scalarInt` / `scalarBooleanTrue` from
  `src/http/queryParsers.ts` — never pass raw `req.query` values downstream.
- **Errors**: catch in the controller and call `forwardError(err, res, next)`
  (`src/http/forwardError.ts`). Operational errors keep their status/code;
  everything else goes to the central handler (redacted 500 + requestId).
- **Request mappers allowlist fields** — build the service input from named
  fields, never spread `req.body`.
- Do not invent repository abstractions; services call the Prisma singleton
  directly.

## Response Contracts (audit before changing anything)

Two established shapes exist — preserve them, do not unify them:

1. **Standard envelope** (most endpoints, via `src/utils/response.ts`):
   - success: `{ success: true, data, message }`
   - error: `{ success: false, error: { code, statusCode, message } }`
   - central handler: `{ success: false, error: { code, message, requestId } }`
2. **Bare response**: `GET /api/v1/dashboard/summary` returns
   `{ total_aset, total_utang, net_worth }` with **no envelope** — preserved
   byte-for-byte for API compatibility.

Never retrofit a global envelope over an existing endpoint; match the shape the
endpoint already ships.

## Command/Query Boundaries

Non-exhaustive examples of the command/query split — check `src/routes/` and
`src/services/` for the full current set before assuming a module isn't
covered:

- transactions: `transaction.service.ts` (mutations) + `transaction-query.service.ts`
- wallets: `wallet.service.ts` (mutations) + `wallet-query.service.ts`
- dashboard: `dashboard-query.service.ts` (read-only)
- installments: `installment-query.service.ts` (read-only)

`src/routes/` currently also includes (non-exhaustive): analytics, budget,
category, merchant mapping, notifications, recurring transactions, saving
goals, users, and the Assistant routes below. New behavior goes into the
matching service, following the factory pattern the existing services use.

## Assistant & Clarification HTTP Integration

`src/routes/assistantRoutes.ts` follows the same layering as every other
route module — thin controllers in `src/controllers/assistant.controller.ts`,
`requireUser` on every route, `mutationLimiter` on every mutating route. The
Assistant state machine, entity resolution, clarification, and draft
mechanics behind these endpoints are owned by `assistant-core.skill.md` —
this file only owns that they follow the standard HTTP/controller
conventions above, not their internals.

## Verification

- `npx tsc --noEmit`, `npx vitest run` (boundary tests exist per module:
  `test/*ControllerBoundary.test.ts`, `test/*Service.test.ts`)
- `npm run build` + commit `dist/` changes (CI diffs the tree).

## Common Mistakes

- Reading `req.body.userId` / `x-user-id` — identity is `req.auth` only.
- Converting Decimals to numbers inside a service — conversion lives in the
  controller serializer.
- Returning `{ data, error }` or another invented envelope — check the module's
  existing shape first.
- Adding a route without `requireUser` (or `requireVerifiedJwt` for bootstrap)
  and without the `mutationLimiter` on writes — copy an existing route module.

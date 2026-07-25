---
name: authentication-security
description: Use when working on authentication, JWT verification, users/sync, middleware ordering, CORS, rate limiting, logging, or anything touching request identity.
---

# Authentication & Security — JWT-Only

## Identity

- A verified **Supabase Bearer JWT** (`Authorization: Bearer <token>`) is the
  ONLY user authentication method. The verified `sub` claim is authoritative.
- Canonical request context: `req.auth` (`{ userId, email? }`), written by
  `requireUser` / `requireVerifiedJwt` (`src/middleware/apiKeyAuth.ts`), read
  via `getAuthenticatedUserId(req)`.
- Never authenticate from `x-user-id`, `x-user-email`, `x-api-key`, body
  `userId`, or query `userId`. That path is retired — never restore it, not
  even "temporarily for rollback".
- An invalid Bearer never falls back to another identity source. Missing /
  invalid / unknown-user all return the same uniform 401
  (`{ success:false, error:{ code:'UNAUTHORIZED', ... } }`); the distinct
  reason (`missing_bearer` / `invalid_token` / `unknown_user`) is logged
  internally only.

## User Sync

- `POST /users/sync` uses `requireVerifiedJwt` (verified JWT, no local-row
  requirement) — it bootstraps the local user with `id = verified sub`.
- Client body can never override identity (`supabaseId` in body is ignored).
- Users have **no password column** — auth is owned by Supabase. Preserve that.

## JWT Configuration (`src/config/index.ts`, `src/utils/supabaseJwt.ts`)

- Current Dev uses **Mode B (JWKS)**: `SUPABASE_URL` (+ optional
  `SUPABASE_JWT_ISSUER`). The Supabase project signs with **ES256**, so Mode B
  is the working mode.
- Do NOT put a Supabase secret API key (`sb_secret_...`) into
  `SUPABASE_JWT_SECRET` — that is an API key, not an HS256 JWT secret; it
  cannot verify tokens.
- Do not configure both modes casually: JWKS wins and silently masks a stale
  secret. Audience `authenticated` is always verified; issuer when derivable.

## Rate Limiting (`src/middleware/rateLimit.ts`)

- **Pre-auth general limiter**: global on `/api`, keys by IP
  (`ip:<normalized>`), protects the auth machinery. Skips OPTIONS.
- **Post-auth mutation limiter**: per-route AFTER the auth gate, keys by
  verified user (`user:<id>`, IP fallback). Writes only.
- Never key a limiter from body/query/custom identity headers.
- `TRUST_PROXY` is a hop **count**, never `true` (spoofable rate-limit key).

## CORS (`src/middleware/cors.ts`)

- Exact origin allowlist from `CORS_ALLOWED_ORIGINS`; empty in production is a
  fatal startup error. No wildcard, ever.
- Allowed headers: `Authorization`, `Content-Type` only. Do not re-advertise
  retired identity headers.
- `credentials: false` (Bearer header auth, not cookies).

## Logging & Errors

- Never log JWTs, Authorization headers, DB URLs, passwords, API keys, claims,
  or raw sensitive metadata. `src/utils/logger.ts` redacts recursively —
  preserve that behavior when adding log fields.
- Never expose Prisma/internal error details to clients: unexpected errors go
  through the central handler (`src/middlewares/error.middleware.ts`) which
  returns a generic message + `requestId` in production.

## Assistant & Clarification Ownership

- Assistant requests, clarification requests, clarification options, Pending
  Financial Drafts, and Assistant continuation/cancellation all belong to the
  authenticated user (`req.auth` / `getAuthenticatedUserId(req)`) — the same
  ownership isolation as any other resource. Never resolve, continue, cancel,
  or confirm one of these on behalf of a different user id.
- Assistant lifecycle mechanics (clarification tokens, expiry, atomic
  continuation, draft confirmation) are owned by
  `assistant-core.skill.md` — this file only owns the identity/ownership
  gate, not the state machine.

## Common Mistakes

- "Identify the user by `x-user-id` for this internal script/test" — no; mint a
  real token or exercise the middleware.
- Adding a route without an auth gate because "it's read-only".
- Logging the token "just in dev" — the redaction contract is unconditional.
- Setting `TRUST_PROXY=true` to fix an IP issue — set the numeric hop count.

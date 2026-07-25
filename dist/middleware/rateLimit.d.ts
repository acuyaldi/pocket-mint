import { type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request } from 'express';
/**
 * Normalized client-IP key. `ipKeyGenerator` collapses IPv6 into a subnet so a
 * single client cannot trivially rotate addresses to bypass the limit. The `ip:`
 * prefix keeps IP buckets in a separate namespace from user buckets (a user id
 * that happens to look like an IP can never collide with a real IP key).
 *
 * This is the key for the PRE-AUTH general limiter: it runs before
 * authentication (mounted globally on `/api`), so no trusted identity exists yet
 * — it protects the token/API-key verification path and keys purely by IP.
 */
export declare function ipKey(req: Request): string;
/**
 * Key for the POST-AUTH mutation limiter. It runs AFTER a JWT auth gate
 * (`requireUser` or `requireVerifiedJwt`), so the canonical `req.auth` context
 * is populated: writes are partitioned per verified user (`user:<id>`), which
 * correctly separates users behind a shared NAT/IP. Falls back to the client IP
 * only as a defensive default if it is ever mounted without a preceding auth
 * gate.
 *
 * Only the trusted `req.auth.userId` (set from a verified JWT `sub`) is ever
 * used — never a self-asserted `x-user-id` header and never a body/query
 * `userId`. Keys carry no token.
 */
export declare function userOrIpKey(req: Request): string;
/**
 * General limiter for all API traffic. Mounted globally before authentication,
 * so it keys by IP and protects the auth machinery. Never limits CORS preflight.
 */
export declare const generalLimiter: RateLimitRequestHandler;
/**
 * Stricter limiter for mutating requests. Mounted AFTER `requireUser` on
 * mutating routes so it can key by the verified user id (IP fallback). Skips
 * preflight and safe (GET/HEAD) methods so only writes are throttled harder.
 *
 * Unlike the general limiter (gated at mount in app.ts), this one is registered
 * directly on routes, so it honors `RATE_LIMIT_ENABLED` via `skip` — disabling
 * rate limiting turns it into a passthrough.
 */
export declare const mutationLimiter: RateLimitRequestHandler;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramWebhookLimiter = exports.mutationLimiter = exports.generalLimiter = void 0;
exports.ipKey = ipKey;
exports.userOrIpKey = userOrIpKey;
const express_rate_limit_1 = require("express-rate-limit");
const authContext_1 = require("../http/authContext");
const config_1 = require("../config");
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
function ipKey(req) {
    return `ip:${(0, express_rate_limit_1.ipKeyGenerator)(req.ip ?? '')}`;
}
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
function userOrIpKey(req) {
    const userId = (0, authContext_1.getAuthenticatedUserId)(req);
    if (userId)
        return `user:${userId}`;
    return ipKey(req);
}
/** 429 in the project's standard JSON error shape. */
function tooManyRequests(_req, res) {
    res.status(429).json({
        success: false,
        error: { statusCode: 429, message: 'Too many requests, please try again later.' },
    });
}
const shared = {
    windowMs: config_1.rateLimitConfig.windowMs,
    standardHeaders: true, // emit RateLimit-* headers
    legacyHeaders: false,
    handler: tooManyRequests,
};
/**
 * General limiter for all API traffic. Mounted globally before authentication,
 * so it keys by IP and protects the auth machinery. Never limits CORS preflight.
 */
exports.generalLimiter = (0, express_rate_limit_1.rateLimit)({
    ...shared,
    limit: config_1.rateLimitConfig.max,
    keyGenerator: ipKey,
    skip: (req) => req.method === 'OPTIONS',
});
/**
 * Stricter limiter for mutating requests. Mounted AFTER `requireUser` on
 * mutating routes so it can key by the verified user id (IP fallback). Skips
 * preflight and safe (GET/HEAD) methods so only writes are throttled harder.
 *
 * Unlike the general limiter (gated at mount in app.ts), this one is registered
 * directly on routes, so it honors `RATE_LIMIT_ENABLED` via `skip` — disabling
 * rate limiting turns it into a passthrough.
 */
exports.mutationLimiter = (0, express_rate_limit_1.rateLimit)({
    ...shared,
    limit: config_1.rateLimitConfig.mutationMax,
    keyGenerator: userOrIpKey,
    skip: (req) => !config_1.rateLimitConfig.enabled ||
        req.method === 'OPTIONS' ||
        req.method === 'GET' ||
        req.method === 'HEAD',
});
/**
 * Separate instance for the public Telegram webhook: no verified user exists
 * (it's server-to-server, not a browser-authenticated caller), so it keys by
 * IP like the general limiter, but with its own generous budget so a burst of
 * legitimate Telegram delivery retries isn't confused with abuse.
 */
exports.telegramWebhookLimiter = (0, express_rate_limit_1.rateLimit)({
    ...shared,
    limit: config_1.rateLimitConfig.max,
    keyGenerator: ipKey,
    skip: () => !config_1.rateLimitConfig.enabled,
});
//# sourceMappingURL=rateLimit.js.map
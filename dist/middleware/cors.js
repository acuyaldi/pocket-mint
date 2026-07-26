"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsMiddleware = exports.corsOptions = void 0;
const cors_1 = __importDefault(require("cors"));
const config_1 = require("../config");
const allowed = new Set(config_1.corsConfig.allowedOrigins);
/**
 * CORS policy: explicit allowlist, no wildcard.
 *
 * - Requests without an `Origin` header (server-to-server, curl, health checks,
 *   same-origin navigation) are allowed.
 * - Browser requests are allowed only when their exact origin is in the
 *   allowlist; unknown origins are rejected by omitting CORS headers (the
 *   browser then blocks the response) rather than throwing a 500.
 * - `credentials` is disabled because the API uses header auth, not cookies —
 *   so a wildcard/credentials conflict can never arise.
 */
exports.corsOptions = {
    origin(origin, callback) {
        if (!origin)
            return callback(null, true);
        return callback(null, allowed.has(origin.replace(/\/+$/, '')));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Only headers the app actually uses. Identity travels exclusively in
    // `Authorization: Bearer <jwt>`; the retired legacy identity headers
    // (x-api-key / x-user-id / x-user-email) are no longer accepted.
    // `Idempotency-Key` is required by `POST /assistant/drafts/:draftId/confirm`.
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    // Browser clients need explicit permission to read the correlation ID
    // header that the correlation middleware sets on every response.
    exposedHeaders: ['X-Correlation-Id'],
    credentials: false,
    optionsSuccessStatus: 204,
};
exports.corsMiddleware = (0, cors_1.default)(exports.corsOptions);
//# sourceMappingURL=cors.js.map
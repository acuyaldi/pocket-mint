"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
exports.codeForStatus = codeForStatus;
const crypto_1 = require("crypto");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const errorCategory_1 = require("../utils/errorCategory");
/** Stable machine-readable code per status; the client can branch on this. */
const CODE_BY_STATUS = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_ERROR',
};
function codeForStatus(statusCode) {
    return CODE_BY_STATUS[statusCode] ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
}
/**
 * Central error boundary. Produces one consistent JSON envelope and, crucially,
 * never exposes stack traces, Prisma/SQL internals, filesystem paths, env
 * values, or raw exception messages for unexpected (5xx) errors in production.
 * Full detail is logged server-side (dev only for stack) via the redacting
 * logger; the client receives a generic message plus a correlation id.
 */
const errorHandler = (err, _req, res, next) => {
    const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
    const isOperational = statusCode < 500;
    const code = codeForStatus(statusCode);
    // Prefer the incoming correlation ID set by correlationMiddleware so the
    // same ID flows through success and error paths; fall back to a fresh UUID
    // when the middleware was not loaded (e.g. test harness without it).
    const requestId = _req.correlationId ?? (0, crypto_1.randomUUID)();
    // Operational errors carry a safe, intentional message. Unexpected errors
    // reveal nothing internal in production; in development the real message is
    // returned to aid debugging (never a secret — messages are not credentials).
    const clientMessage = isOperational
        ? err.message || code
        : config_1.isProduction
            ? 'Internal Server Error'
            : err.message || 'Internal Server Error';
    logger_1.logger.error('request error', {
        requestId,
        statusCode,
        code,
        errorCategory: (0, errorCategory_1.categorizeError)(err),
        message: err.message,
        ...(config_1.isProduction ? {} : { stack: err.stack }),
    });
    // If the response already started streaming, defer to Express' default.
    if (res.headersSent)
        return next(err);
    res.status(statusCode).json({
        success: false,
        error: { code, message: clientMessage, requestId },
    });
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=error.middleware.js.map
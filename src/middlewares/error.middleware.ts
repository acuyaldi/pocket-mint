import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { isProduction } from '../config';
import { logger } from '../utils/logger';
import { categorizeError } from '../utils/errorCategory';

/**
 * An error that carries an intended HTTP status. Errors with a status < 500 are
 * treated as *operational* (safe, expected — their message may be shown to the
 * client). Everything else is an unexpected failure whose internals must never
 * leak to the client in production.
 */
export interface AppError extends Error {
  statusCode?: number;
}

/** Stable machine-readable code per status; the client can branch on this. */
const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
};

export function codeForStatus(statusCode: number): string {
  return CODE_BY_STATUS[statusCode] ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
}

/**
 * Central error boundary. Produces one consistent JSON envelope and, crucially,
 * never exposes stack traces, Prisma/SQL internals, filesystem paths, env
 * values, or raw exception messages for unexpected (5xx) errors in production.
 * Full detail is logged server-side (dev only for stack) via the redacting
 * logger; the client receives a generic message plus a correlation id.
 */
export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
  const isOperational = statusCode < 500;
  const code = codeForStatus(statusCode);
  // Prefer the incoming correlation ID set by correlationMiddleware so the
  // same ID flows through success and error paths; fall back to a fresh UUID
  // when the middleware was not loaded (e.g. test harness without it).
  const requestId = _req.correlationId ?? randomUUID();

  // Operational errors carry a safe, intentional message. Unexpected errors
  // reveal nothing internal in production; in development the real message is
  // returned to aid debugging (never a secret — messages are not credentials).
  const clientMessage = isOperational
    ? err.message || code
    : isProduction
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error';

  logger.error('request error', {
    requestId,
    statusCode,
    code,
    errorCategory: categorizeError(err),
    message: err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });

  // If the response already started streaming, defer to Express' default.
  if (res.headersSent) return next(err);

  res.status(statusCode).json({
    success: false,
    error: { code, message: clientMessage, requestId },
  });
};

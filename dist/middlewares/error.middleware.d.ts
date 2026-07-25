import { Request, Response, NextFunction } from 'express';
/**
 * An error that carries an intended HTTP status. Errors with a status < 500 are
 * treated as *operational* (safe, expected — their message may be shown to the
 * client). Everything else is an unexpected failure whose internals must never
 * leak to the client in production.
 */
export interface AppError extends Error {
    statusCode?: number;
}
export declare function codeForStatus(statusCode: number): string;
/**
 * Central error boundary. Produces one consistent JSON envelope and, crucially,
 * never exposes stack traces, Prisma/SQL internals, filesystem paths, env
 * values, or raw exception messages for unexpected (5xx) errors in production.
 * Full detail is logged server-side (dev only for stack) via the redacting
 * logger; the client receives a generic message plus a correlation id.
 */
export declare const errorHandler: (err: AppError, _req: Request, res: Response, next: NextFunction) => void;

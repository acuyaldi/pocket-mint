import type { Request, Response, NextFunction } from 'express';
export declare const CORRELATION_HEADER = "X-Correlation-Id";
/**
 * Express declaration merge — makes `correlationId` visible on
 * every Request without a bespoke subtype.
 */
declare global {
    namespace Express {
        interface Request {
            correlationId: string;
        }
    }
}
/**
 * Middleware: generate a fresh correlation ID and attach it to the
 * request and response. We deliberately do NOT accept a
 * caller-supplied correlation ID header — every request gets a
 * new, safe ID. This avoids correlation-injection risks and keeps
 * the log chain intact.
 */
export declare function correlationMiddleware(req: Request, res: Response, next: NextFunction): void;

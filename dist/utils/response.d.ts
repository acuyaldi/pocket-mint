import { Response } from 'express';
export declare const sendSuccess: <T>(res: Response, data: T, message?: string, statusCode?: number) => void;
/**
 * Send an operational error in the standard envelope. `code` defaults to a
 * stable mapping of the status; pass an explicit one for domain-specific codes.
 * Messages passed here must be safe to expose (no internals/secrets).
 */
export declare const sendError: (res: Response, message?: string, statusCode?: number, code?: string) => void;

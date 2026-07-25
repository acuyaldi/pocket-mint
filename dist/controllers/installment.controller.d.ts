import { Request, Response, NextFunction } from 'express';
/**
 * GET /api/v1/installments/rates
 * Static paylater provider rates (bunga %/bulan + biaya admin %). No identity and
 * no database access — pure config, so it stays a thin handler in the controller.
 */
export declare function getPaylaterRates(_req: Request, res: Response): void;
/**
 * GET /api/v1/installments
 * List installments for the authenticated user, optionally filtered by `status`.
 * Thin HTTP boundary: resolves the canonical `req.auth` identity, structurally
 * parses the `status` query scalar, delegates ownership-scoped reads and status
 * validation to the query service, serializes the Decimal result, and forwards
 * any thrown error (a typed 400 for an invalid status; anything unexpected to the
 * central handler). The service — never this handler — touches Prisma.
 */
export declare function getInstallments(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function payInstallment(req: Request<{
    id: string;
}, unknown, {
    sourceWalletId?: string;
    amount?: number | string;
    date?: string;
}>, res: Response, next: NextFunction): Promise<void>;

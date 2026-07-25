import { Request, Response, NextFunction } from 'express';
/**
 * GET /api/v1/dashboard/summary
 * Returns aggregated financial summary: total_aset, total_utang, net_worth.
 */
export declare const getDashboardSummary: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;

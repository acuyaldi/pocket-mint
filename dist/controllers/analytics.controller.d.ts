import { Request, Response, NextFunction } from 'express';
export declare class AnalyticsController {
    static overview(req: Request, res: Response, next: NextFunction): Promise<void>;
    static trends(req: Request, res: Response, next: NextFunction): Promise<void>;
    static categories(req: Request, res: Response, next: NextFunction): Promise<void>;
    static wallets(req: Request, res: Response, next: NextFunction): Promise<void>;
    static budgetPerformance(req: Request, res: Response, next: NextFunction): Promise<void>;
    static transactions(req: Request, res: Response, next: NextFunction): Promise<void>;
}

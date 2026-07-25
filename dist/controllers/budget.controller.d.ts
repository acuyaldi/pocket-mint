import { Request, Response, NextFunction } from 'express';
import type { CreateBudgetDto, UpdateBudgetAmountDto } from '../models/budget.model';
export declare class BudgetController {
    static list(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getOne(req: Request<{
        id: string;
    }>, res: Response, next: NextFunction): Promise<void>;
    static create(req: Request<unknown, unknown, CreateBudgetDto>, res: Response, next: NextFunction): Promise<void>;
    static update(req: Request<{
        id: string;
    }, unknown, UpdateBudgetAmountDto & {
        categoryId?: unknown;
    }>, res: Response, next: NextFunction): Promise<void>;
    static archive(req: Request<{
        id: string;
    }>, res: Response, next: NextFunction): Promise<void>;
    static restore(req: Request<{
        id: string;
    }>, res: Response, next: NextFunction): Promise<void>;
}

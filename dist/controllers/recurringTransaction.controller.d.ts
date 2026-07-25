import { Request, Response, NextFunction } from 'express';
import { CreateRecurringTransactionDto, UpdateRecurringTransactionDto } from '../models/recurringTransaction.model';
export declare class RecurringTransactionController {
    static getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
    static create(req: Request<unknown, unknown, CreateRecurringTransactionDto>, res: Response, next: NextFunction): Promise<void>;
    static update(req: Request<{
        id: string;
    }, unknown, UpdateRecurringTransactionDto>, res: Response, next: NextFunction): Promise<void>;
    static delete(req: Request<{
        id: string;
    }>, res: Response, next: NextFunction): Promise<void>;
}

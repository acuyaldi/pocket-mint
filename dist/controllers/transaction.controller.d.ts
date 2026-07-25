import { Request, Response, NextFunction } from 'express';
import { Prisma } from '../generated/prisma/client';
import { CreateTransactionDto, UpdateTransactionDto } from '../models/transaction.model';
/** Exported so other controllers generating a Transaction (e.g. notification confirm) reuse the same serializer. */
export declare const serializeTransaction: <T extends {
    amount: Prisma.Decimal;
}>(tx: T) => T & {
    amount: number;
};
export declare class TransactionController {
    static getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
    static summary(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getAllTime(req: Request, res: Response, next: NextFunction): Promise<void>;
    static export(req: Request, res: Response, next: NextFunction): Promise<void>;
    static create(req: Request<unknown, unknown, CreateTransactionDto>, res: Response, next: NextFunction): Promise<void>;
    static update(req: Request<{
        id: string;
    }, unknown, UpdateTransactionDto>, res: Response, next: NextFunction): Promise<void>;
    static delete(req: Request<{
        id: string;
    }>, res: Response, next: NextFunction): Promise<void>;
}

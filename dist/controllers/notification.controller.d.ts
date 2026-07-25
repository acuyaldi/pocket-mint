import { Request, Response, NextFunction } from 'express';
export declare class NotificationController {
    static getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
    static refresh(req: Request, res: Response, next: NextFunction): Promise<void>;
    static markRead(req: Request<{
        id: string;
    }>, res: Response, next: NextFunction): Promise<void>;
    static markAllRead(req: Request, res: Response, next: NextFunction): Promise<void>;
    static confirm(req: Request<{
        id: string;
    }, unknown, {
        amount?: string | number;
    }>, res: Response, next: NextFunction): Promise<void>;
}

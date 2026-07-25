import { Request, Response, NextFunction } from 'express';
import { CreateSavingGoalDto, UpdateSavingGoalDto, UpdateSavingGoalProgressDto } from '../models/savingGoal.model';
export declare class SavingGoalController {
    static getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getOne(req: Request<{
        id: string;
    }>, res: Response, next: NextFunction): Promise<void>;
    static create(req: Request<unknown, unknown, CreateSavingGoalDto>, res: Response, next: NextFunction): Promise<void>;
    static update(req: Request<{
        id: string;
    }, unknown, UpdateSavingGoalDto>, res: Response, next: NextFunction): Promise<void>;
    static updateProgress(req: Request<{
        id: string;
    }, unknown, UpdateSavingGoalProgressDto>, res: Response, next: NextFunction): Promise<void>;
    static archive(req: Request<{
        id: string;
    }>, res: Response, next: NextFunction): Promise<void>;
}

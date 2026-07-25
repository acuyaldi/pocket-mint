import { Request, Response, NextFunction } from 'express';
import type { CreateMerchantMappingDto, UpdateMerchantMappingDto } from '../models/merchantMapping.model';
export declare class MerchantMappingController {
    static list(req: Request, res: Response, next: NextFunction): Promise<void>;
    static create(req: Request<unknown, unknown, CreateMerchantMappingDto>, res: Response, next: NextFunction): Promise<void>;
    static update(req: Request<{
        id: string;
    }, unknown, UpdateMerchantMappingDto>, res: Response, next: NextFunction): Promise<void>;
    static remove(req: Request<{
        id: string;
    }>, res: Response, next: NextFunction): Promise<void>;
}

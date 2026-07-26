import type { NextFunction, Request, Response } from 'express';
import type { ChannelLinkTokenService } from '../channels/linkToken.service';
import type { ChannelConnectionService } from '../channels/connection.service';
export declare function createChannelLinkControllers(linkTokens: ChannelLinkTokenService, connections: ChannelConnectionService): {
    createLinkToken: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    getConnection: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    revokeConnection: (req: Request, res: Response, next: NextFunction) => Promise<void>;
};
export declare const createChannelLinkToken: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getChannelConnection: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const revokeChannelConnection: (req: Request, res: Response, next: NextFunction) => Promise<void>;

import { Request, Response, NextFunction } from 'express';
import type { DecimalInput, WalletType, AdminFeeType } from '../services/wallet.types';
/** Allowlisted create-wallet request body (no `userId` — that is resolved separately). */
interface CreateWalletBody {
    name?: string;
    type?: WalletType;
    balance?: DecimalInput;
    principal?: DecimalInput;
    creditLimit?: DecimalInput;
    cutoffDay?: number | null;
    paymentDueDay?: number | null;
    interestRate?: DecimalInput;
    adminFee?: DecimalInput;
    adminFeeType?: AdminFeeType;
    icon?: string | null;
    color?: string | null;
}
/** Allowlisted update-wallet request body. `userId`/`walletId` come from auth + route. */
interface UpdateWalletBody {
    name?: string;
    type?: WalletType;
    balance?: DecimalInput;
    creditLimit?: DecimalInput | null;
    cutoffDay?: number | null;
    paymentDueDay?: number | null;
    interestRate?: DecimalInput;
    adminFee?: DecimalInput;
    adminFeeType?: AdminFeeType;
    icon?: string | null;
    color?: string | null;
    isArchived?: boolean;
}
/**
 * GET /api/v1/wallets
 * Returns list of wallets for the authenticated user,
 * with computed fields: sisa_limit & outstanding_debt for DEBT wallets.
 */
export declare const getAllWallets: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * POST /api/v1/wallets
 * Create a new wallet for the user.
 */
export declare const createWallet: (req: Request<unknown, unknown, CreateWalletBody>, res: Response, next: NextFunction) => Promise<void>;
/**
 * PUT /api/v1/wallets/:id
 * Update wallet details.
 */
export declare const updateWallet: (req: Request<{
    id: string;
}, unknown, UpdateWalletBody>, res: Response, next: NextFunction) => Promise<void>;
/**
 * DELETE /api/v1/wallets/:id
 * Hard delete with transaction check: refuses when the wallet has transaction
 * history unless ?force=true (frontend confirm modal sends force).
 */
export declare const deleteWallet: (req: Request<{
    id: string;
}>, res: Response, next: NextFunction) => Promise<void>;
/**
 * GET /api/v1/wallets/:id/sparkline
 * Returns up to 7 historical balance data points for a wallet.
 * Used to render mini sparkline charts on dashboard wallet cards.
 */
export declare const getWalletSparkline: (req: Request<{
    id: string;
}>, res: Response, next: NextFunction) => Promise<void>;
export {};

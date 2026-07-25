import type { CreateWalletInput, DeleteWalletInput, DeleteWalletResult, UpdateWalletInput, Wallet, WalletPrismaClient } from './wallet.types';
export declare function createWalletService(db: WalletPrismaClient): {
    createWallet: (input: CreateWalletInput) => Promise<Wallet>;
    updateWallet: (input: UpdateWalletInput) => Promise<Wallet>;
    deleteWallet: (input: DeleteWalletInput) => Promise<DeleteWalletResult>;
};
/** Production instance bound to the shared Prisma singleton. */
export declare const walletService: {
    createWallet: (input: CreateWalletInput) => Promise<Wallet>;
    updateWallet: (input: UpdateWalletInput) => Promise<Wallet>;
    deleteWallet: (input: DeleteWalletInput) => Promise<DeleteWalletResult>;
};

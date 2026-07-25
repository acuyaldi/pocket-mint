import { Prisma } from '../generated/prisma/client';
export declare function classifyWalletForNetWorth(type: string): 'ASSET' | 'DEBT';
export interface WalletInput {
    type: string;
    balance: Prisma.Decimal;
}
/**
 * Menghitung net worth, total aset, dan total utang dari array wallet.
 * Menggunakan Prisma.Decimal untuk presisi finansial.
 *
 * PD-001 (Approved): Net Worth = Total Assets − Total Outstanding Debt,
 * evaluated over the same wallet snapshot (one Reporting Cutoff). May be
 * negative; never clamped. Installment debt is already locked into the debt
 * wallet's outstanding balance at creation, so it is counted exactly once
 * here — no separate installment term may be subtracted again.
 */
export declare function calculateNetWorth(wallets: WalletInput[]): {
    totalAset: Prisma.Decimal;
    totalUtang: Prisma.Decimal;
    netWorth: Prisma.Decimal;
};

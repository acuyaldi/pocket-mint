import { Prisma } from '../generated/prisma/client';
export type FinancialTxType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
/**
 * A signed balance change for a single wallet. `amount` is signed:
 * positive credits the wallet, negative debits it. Applying a delta is
 * always `balance += amount`, so reversal is simply negation.
 */
export interface WalletDelta {
    walletId: string;
    amount: Prisma.Decimal;
}
/**
 * Persistence-independent view of a transaction's money movement. Built
 * from a stored Transaction row (for reversal) or from validated request
 * data (for a new effect) — never from a mix of the two.
 */
export interface BalanceEffectInput {
    type: FinancialTxType;
    /** The transaction's stored `amount` (monthly portion for installments). */
    amount: Prisma.Decimal;
    /** Source wallet: credited by INCOME, debited by EXPENSE/TRANSFER. */
    walletId: string;
    /** Destination wallet — required for TRANSFER, ignored otherwise. */
    toWalletId?: string | null;
    /** True when this expense is backed by an Installment row. */
    isInstallment?: boolean;
    /**
     * The linked installment's `grandTotal` (principal + interest). An
     * installment locks the wallet for the FULL debt at create time even
     * though the transaction row only stores the monthly amount, so its
     * balance effect must use grandTotal, not `amount` (fixes C2).
     */
    installmentGrandTotal?: Prisma.Decimal | null;
}
/** Deltas to apply when a transaction is created. Strict: transfers need a destination. */
export declare function computeBalanceEffect(input: BalanceEffectInput): WalletDelta[];
/** Deltas to undo a persisted transaction's effect — the exact negation of create. */
export declare function reverseBalanceEffect(input: BalanceEffectInput): WalletDelta[];
/** Minimal shape of a Prisma transaction client needed to apply deltas. */
export interface WalletBalanceClient {
    wallet: {
        update(args: {
            where: {
                id: string;
            };
            data: {
                balance: {
                    increment: Prisma.Decimal;
                };
            };
        }): Promise<unknown>;
    };
}
/**
 * Apply signed deltas to wallet balances using atomic DB increments
 * (Invariant 6 — no read-modify-write race). MUST be called inside an
 * existing `$transaction` so all wallet writes commit or roll back together.
 */
export declare function applyBalanceDeltas(txClient: WalletBalanceClient, deltas: WalletDelta[]): Promise<void>;
/** A ledger row as needed to recompute an expected balance. */
export interface LedgerTransaction {
    type: FinancialTxType;
    amount: Prisma.Decimal;
    walletId: string;
    toWalletId?: string | null;
    isInstallment?: boolean;
    installmentId?: string | null;
}
export interface WalletSnapshot {
    id: string;
    initialBalance: Prisma.Decimal;
    balance: Prisma.Decimal;
}
export interface WalletReconciliation {
    walletId: string;
    stored: Prisma.Decimal;
    expected: Prisma.Decimal;
    drift: Prisma.Decimal;
}
/**
 * Recompute each wallet's expected balance from its opening balance plus the
 * signed effect of every transaction, then report the drift versus the stored
 * running total. Pure and deterministic; never mutates anything.
 *
 * `grandTotalByInstallment` supplies the full debt for installment expenses.
 */
export declare function reconcileWalletBalances(wallets: WalletSnapshot[], transactions: LedgerTransaction[], grandTotalByInstallment?: Map<string, Prisma.Decimal>): WalletReconciliation[];

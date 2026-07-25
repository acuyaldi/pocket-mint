import { Prisma } from '../generated/prisma/client';
import { type LedgerTransaction } from './transactionBalance';
export type DriftClassification = 'CLEAN' | 'LIKELY_INITIAL_BALANCE_MISSING' | 'LEGACY_TRANSFER_UNRESOLVED' | 'MANUAL_BALANCE_OVERRIDE_SUSPECTED' | 'UNCLASSIFIED_DRIFT';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
/** A ledger row with the extra fields needed to list legacy transfers. */
export interface AuditTransaction extends LedgerTransaction {
    id?: string | null;
    date?: Date | null;
    createdAt?: Date | null;
}
export interface AuditWalletSnapshot {
    id: string;
    name?: string | null;
    initialBalance: Prisma.Decimal;
    balance: Prisma.Decimal;
    /** When known, used to decide whether the wallet predates the Sprint 2A fix. */
    createdAt?: Date | null;
}
export interface AuditOptions {
    /**
     * Deploy timestamp of the toWalletId/initialBalance fix. When set, wallets
     * created before it are flagged `predatesFix`. Omitted → `predatesFix` is null.
     */
    fixDeployedAt?: Date;
    /**
     * Wallets whose `initialBalance` has been independently verified by an
     * operator. Only these can reach HIGH repair confidence; we never assume it.
     */
    verifiedInitialBalanceWalletIds?: ReadonlySet<string>;
    /**
     * Wallets an external audit trail marks as manually overridden. There is no
     * in-data signal for this, so it defaults to empty — we never fabricate one.
     */
    manualOverrideWalletIds?: ReadonlySet<string>;
}
/** A destination-less transfer surfaced for manual investigation. */
export interface LegacyTransfer {
    id: string | null;
    walletId: string;
    amount: string;
    date: string | null;
    createdAt: string | null;
}
export interface WalletAudit {
    walletId: string;
    name: string | null;
    stored: Prisma.Decimal;
    initialBalance: Prisma.Decimal;
    /** expected − initialBalance: the net effect the ledger accounts for. */
    ledgerEffect: Prisma.Decimal;
    expected: Prisma.Decimal;
    drift: Prisma.Decimal;
    /** Destination-less transfers whose SOURCE is this wallet (definitely affected). */
    legacyTransferCount: number;
    /** True/false when `fixDeployedAt` is known and `createdAt` present; else null. */
    predatesFix: boolean | null;
    classification: DriftClassification;
    confidence: Confidence;
    reason: string;
}
export interface AuditReport {
    wallets: WalletAudit[];
    legacyTransfers: LegacyTransfer[];
    /** True when any wallet is non-CLEAN (drives a non-zero script exit code). */
    hasDrift: boolean;
}
/**
 * Produce a per-wallet audit plus a list of legacy (destination-less) transfers.
 * Read-only and deterministic.
 */
export declare function auditWalletBalances(wallets: AuditWalletSnapshot[], transactions: AuditTransaction[], grandTotalByInstallment?: Map<string, Prisma.Decimal>, options?: AuditOptions): AuditReport;

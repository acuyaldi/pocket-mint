import type { WalletAudit, Confidence, DriftClassification } from './reconciliation';
export interface RepairProposal {
    walletId: string;
    name: string | null;
    classification: DriftClassification;
    currentBalance: string;
    expectedBalance: string;
    /** expected − current: the signed change a repair would apply to the stored balance. */
    difference: string;
    confidence: Confidence;
    reason: string;
    /** True whenever confidence is LOW — no automatic recommendation is made. */
    requiresManualInvestigation: boolean;
    /** True ONLY at HIGH confidence. LOW/MEDIUM proposals must never be auto-applied. */
    autoApplyEligible: boolean;
}
export interface RepairPlanOptions {
    /** Wallets whose initial balance an operator has independently verified. */
    verifiedInitialBalanceWalletIds?: ReadonlySet<string>;
}
/**
 * Build repair proposals from audit records. CLEAN wallets are omitted. Pure and
 * read-only — the caller decides whether, when, and how to act on a proposal.
 */
export declare function buildRepairPlan(audits: WalletAudit[], options?: RepairPlanOptions): RepairProposal[];

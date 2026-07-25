import { Prisma } from '../generated/prisma/client';
export type BudgetStatus = 'HEALTHY' | 'APPROACHING' | 'REACHED' | 'EXCEEDED' | 'ARCHIVED';
export interface BudgetUsage {
    /** Sum of matching posted EXPENSE transactions for the period (§2). */
    spent: Prisma.Decimal;
    /** amount - spent. May be negative; never clamped to zero (§3). */
    remaining: Prisma.Decimal;
    /**
     * (spent / amount) * 100, exact Decimal division, unrounded. `null` only in
     * the defensive zero/negative-amount branch below — Budget creation
     * validates `amount > 0`, so this should be unreachable in practice.
     */
    percentUsed: Prisma.Decimal | null;
    status: BudgetStatus;
}
/**
 * Derive a Budget's usage from its definition (`amount`, `isArchived`) and its
 * already-aggregated `spent` figure for one reporting period. Status is
 * evaluated in the order ARCHIVED, EXCEEDED (>100), REACHED (==100),
 * APPROACHING (>=75), else HEALTHY (PD-009 Decision E) — never rounded before
 * comparison, so a spend of 749,999/1,000,000 never rounds up to a false
 * APPROACHING boundary.
 */
export declare function computeBudgetUsage(amount: Prisma.Decimal, spent: Prisma.Decimal, isArchived: boolean): BudgetUsage;

import type { PrismaClient, Prisma } from '../generated/prisma/client';
import type { BudgetUsage } from '../domain/budget';
/**
 * The slice of the Prisma client the query service needs: read access to
 * `budget` (ownership-scoped lookups) and `transaction` (spend aggregation).
 * No write methods are exposed — this service performs no mutations.
 */
export type BudgetQueryPrismaClient = Pick<PrismaClient, 'budget' | 'transaction'>;
/** A persisted Budget row, verbatim (Decimal `amount` intact). */
export type BudgetRecord = Prisma.BudgetGetPayload<object>;
/**
 * A persisted Budget row joined with the owning Category's `id`/`name`/`type`
 * — the exact shape `BudgetDto.category` (Phase B2) needs, fetched via a
 * single `include`, never a per-row lookup.
 */
export type BudgetRecordWithCategory = Prisma.BudgetGetPayload<{
    include: {
        category: {
            select: {
                id: true;
                name: true;
                type: true;
            };
        };
    };
}>;
/**
 * One Budget combined with its derived usage for the resolved period.
 * `periodStart`/`periodEnd` are the same half-open reporting-month bounds used
 * to compute `spent`, exposed so the controller's `BudgetDto` mapper (Phase B2)
 * never re-derives them via server-local Date math.
 */
export interface BudgetWithUsage extends BudgetUsage {
    budget: BudgetRecordWithCategory;
    periodStart: Date;
    periodEnd: Date;
}
/**
 * Input for resolving usage of one Budget the caller owns. `userId` is the
 * authenticated caller — never taken from client input. `month`/`year` are
 * optional overrides (1-12 / e.g. 2026); omitted means the current reporting
 * month, resolved via `getReportingMonthRange` (never server-local Date math).
 */
export interface GetBudgetUsageInput {
    userId: string;
    budgetId: string;
    month?: number;
    year?: number;
}
/**
 * Input for resolving usage of every Budget a user owns. `status` selects
 * active (default, `isArchived: false`) or archived (`isArchived: true`) —
 * mirrors the API contract's `GET /budgets?status=` filter (Phase B2). There
 * is no "both" option, matching the Budgets screen's single explicit toggle.
 */
export interface ListActiveBudgetUsageInput {
    userId: string;
    month?: number;
    year?: number;
    status?: 'active' | 'archived';
}

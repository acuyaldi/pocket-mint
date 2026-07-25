import type { PrismaClient, Prisma } from '../generated/prisma/client';
/**
 * The slice of the Prisma client the query service needs: read access to the
 * `wallet` model only (`findMany` for the net-worth totals). Ownership is
 * enforced by scoping every query on `userId`, so no write surface — and no other
 * model — is required or exposed.
 */
export type DashboardQueryPrismaClient = Pick<PrismaClient, 'wallet'>;
/**
 * Input for the dashboard summary (`GET /dashboard/summary`). `userId` is the
 * authenticated caller, injected by `requireUser` — never taken from the query
 * string or body. The endpoint accepts no other parameters today.
 */
export interface GetDashboardSummaryInput {
    userId: string;
}
/**
 * Dashboard summary carrying exact `Decimal` values. Serialization to numbers is
 * the controller's job (the single response boundary); the service never calls
 * `.toNumber()` / `parseFloat`. Product rule (PD-001, delegated to
 * `calculateNetWorth`): `totalAset` = CASH/BANK/E_WALLET balances; `totalUtang` =
 * |CREDIT_CARD/PAYLATER/LOAN balances|; `netWorth` = `totalAset` − `totalUtang`
 * (may be negative; components stay separately reported). Structurally
 * identical to the wallet query service's `WalletTotals`, kept as its own type so
 * the dashboard contract is self-contained.
 */
export interface DashboardSummaryResult {
    totalAset: Prisma.Decimal;
    totalUtang: Prisma.Decimal;
    netWorth: Prisma.Decimal;
}

import type { PrismaClient, Prisma, InstallmentStatus } from '../generated/prisma/client';
export type { InstallmentStatus };
/**
 * The slice of the Prisma client the query service needs: read access to the
 * `installment` model only (`findMany`, with the wallet fields pulled through a
 * relation `include` — no direct `wallet` model access). Ownership is enforced by
 * scoping every query on `userId`, so no write surface and no other model is
 * required or exposed.
 */
export type InstallmentQueryPrismaClient = Pick<PrismaClient, 'installment'>;
/**
 * Input for the installment list (`GET /installments`). `userId` is the
 * authenticated caller, injected by `requireUser` — never taken from the query
 * string or body. `status` is the raw, client-supplied scalar filter (already
 * reduced to a single string by the controller's `scalarString`); it is left
 * unvalidated here on purpose — the service is the one place that classifies it
 * against the allowed set and throws a typed 400 for an unknown value, preserving
 * the existing lenient rule that a falsy value (absent / empty) means "no filter".
 */
export interface ListInstallmentsInput {
    userId: string;
    status?: string;
}
/**
 * One installment row as read for the list, carrying exact `Decimal` money fields
 * plus the wallet's display fields via the relation `include`. Serialization to
 * numbers is the controller's job (the single response boundary); the service
 * never calls `.toNumber()` / `parseFloat`. Shape is the Prisma payload for the
 * exact `include` the service issues, so it stays in lockstep with the query.
 */
export type InstallmentListItem = Prisma.InstallmentGetPayload<{
    include: {
        wallet: {
            select: {
                id: true;
                name: true;
                type: true;
            };
        };
        transactions: {
            select: {
                id: true;
                type: true;
                createdAt: true;
            };
        };
    };
}>;

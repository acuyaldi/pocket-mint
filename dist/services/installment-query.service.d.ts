import type { InstallmentListItem, InstallmentQueryPrismaClient, ListInstallmentsInput } from './installment-query.types';
export declare function createInstallmentQueryService(db: InstallmentQueryPrismaClient): {
    listInstallments: (input: ListInstallmentsInput) => Promise<InstallmentListItem[]>;
};
/** Production instance bound to the shared Prisma singleton. */
export declare const installmentQueryService: {
    listInstallments: (input: ListInstallmentsInput) => Promise<InstallmentListItem[]>;
};

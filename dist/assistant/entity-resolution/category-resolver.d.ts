import type { PrismaClient } from '../../generated/prisma/client';
import { type EntityResolver, type TrustedEntityConstraints } from './types';
interface CategoryTransactionCreateConstraints extends TrustedEntityConstraints {
    readonly eligibleFor: 'transaction.create';
    readonly ownerScoped: true;
    readonly transactionType: 'INCOME' | 'EXPENSE';
}
export declare const CATEGORY_TRANSACTION_CREATE_CONSTRAINTS: Readonly<CategoryTransactionCreateConstraints>;
export declare function categoryConstraintsForType(transactionType: 'INCOME' | 'EXPENSE'): Readonly<CategoryTransactionCreateConstraints>;
export declare function createCategoryResolver(db: Pick<PrismaClient, 'category'>): EntityResolver;
export {};

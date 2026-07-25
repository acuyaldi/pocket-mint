import type { PrismaClient } from '../../generated/prisma/client';
import { type EntityResolver, type TrustedEntityConstraints } from './types';
interface MerchantTransactionCreateConstraints extends TrustedEntityConstraints {
    readonly eligibleFor: 'transaction.create';
    readonly ownerScoped: true;
}
export declare const MERCHANT_TRANSACTION_CREATE_CONSTRAINTS: Readonly<MerchantTransactionCreateConstraints>;
export declare function createMerchantResolver(db: Pick<PrismaClient, 'merchantMapping'>): EntityResolver;
export {};

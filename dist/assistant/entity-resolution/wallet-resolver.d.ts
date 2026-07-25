import type { PrismaClient } from '../../generated/prisma/client';
import { type EntityResolver, type TrustedEntityConstraints } from './types';
interface WalletTransactionCreateConstraints extends TrustedEntityConstraints {
    readonly eligibleFor: 'transaction.create';
    readonly activeOnly: true;
}
export declare const WALLET_TRANSACTION_CREATE_CONSTRAINTS: Readonly<WalletTransactionCreateConstraints>;
export declare function createWalletResolver(db: Pick<PrismaClient, 'wallet'>): EntityResolver;
export {};

import type { PrismaClient, Prisma } from '../generated/prisma/client';
import type { TransactionType } from '../models/transaction.model';
/**
 * The slice of the Prisma client the transaction service needs. Injecting this
 * (rather than importing the singleton everywhere) lets tests substitute a fake
 * and keeps the service from constructing its own client.
 */
export type TransactionPrismaClient = Pick<PrismaClient, 'transaction' | 'wallet' | 'installment' | 'category' | '$transaction'>;
export type TransactionAtomicClient = Pick<Prisma.TransactionClient, 'transaction' | 'wallet' | 'installment' | 'category'>;
/** Amount accepted from the controller; normalized to Decimal inside the service. */
export type DecimalInput = Prisma.Decimal | number | string;
export interface CreateTransactionInput {
    userId: string;
    type: TransactionType;
    amount: DecimalInput;
    /** Optional — defaults to the user's first wallet, as today. */
    walletId?: string;
    toWalletId?: string;
    categoryId?: string;
    description?: string;
    /** ISO day (`YYYY-MM-DD`) or offset timestamp; normalized in the service. */
    date?: string;
    isInstallment?: boolean;
    billingMode?: 'FULL' | 'INSTALLMENT';
    installmentMonths?: number;
    interestRate?: number;
    firstDueDate?: string;
}
export interface CreateTransactionOptions {
    transaction?: TransactionAtomicClient;
}
/** Update fields; `undefined` means "omitted" (keep the persisted value). */
export interface UpdateTransactionFields {
    type?: TransactionType;
    amount?: DecimalInput;
    description?: string;
    date?: string;
    categoryId?: string;
    walletId?: string;
    toWalletId?: string;
    /** Only used to reject a regular→installment conversion. */
    isInstallment?: boolean;
}
export interface UpdateTransactionInput extends UpdateTransactionFields {
    userId: string;
    id: string;
}
export interface DeleteTransactionInput {
    userId: string;
    id: string;
}
/**
 * Relations every mutation returns — the shape the controller's existing
 * serializer already expects. Kept here so the service and its result type
 * stay in sync.
 */
export declare const TRANSACTION_INCLUDE: {
    readonly wallet: {
        readonly select: {
            readonly id: true;
            readonly name: true;
            readonly type: true;
        };
    };
    readonly category: {
        readonly select: {
            readonly id: true;
            readonly name: true;
            readonly type: true;
        };
    };
};
export type TransactionWithRelations = Prisma.TransactionGetPayload<{
    include: typeof TRANSACTION_INCLUDE;
}>;
export interface DeleteTransactionResult {
    id: string;
}

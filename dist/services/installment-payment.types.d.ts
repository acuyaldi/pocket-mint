import type { PrismaClient, Prisma } from '../generated/prisma/client';
export type InstallmentPaymentPrismaClient = Pick<PrismaClient, 'installment' | 'wallet' | 'transaction' | '$transaction'>;
export type DecimalInput = Prisma.Decimal | number | string;
export interface PayInstallmentInput {
    userId: string;
    installmentId: string;
    sourceWalletId: string;
    amount?: DecimalInput;
    date?: string;
}
export type PaidInstallment = Prisma.InstallmentGetPayload<{
    include: {
        wallet: {
            select: {
                id: true;
                name: true;
                type: true;
            };
        };
    };
}>;
export type InstallmentPaymentTransaction = Prisma.TransactionGetPayload<{
    include: {
        wallet: {
            select: {
                id: true;
                name: true;
                type: true;
            };
        };
        toWallet: {
            select: {
                id: true;
                name: true;
                type: true;
            };
        };
    };
}>;
export interface PayInstallmentResult {
    installment: PaidInstallment;
    transaction: InstallmentPaymentTransaction;
}

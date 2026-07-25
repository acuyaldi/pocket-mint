import { Prisma } from '../generated/prisma/client';
import type { FinancialTxType } from './transactionBalance';
export interface ReportingTransaction {
    type: FinancialTxType;
    amount: Prisma.Decimal;
    walletId: string;
    toWalletId?: string | null;
    isInstallment?: boolean;
    installment?: {
        grandTotal: Prisma.Decimal;
    } | null;
}
export declare function getWalletReportingEffect(transaction: ReportingTransaction, walletId: string): Prisma.Decimal;
export declare function getAggregateCashFlowEffect(transaction: ReportingTransaction): Prisma.Decimal;

import type { InstallmentPaymentPrismaClient, PayInstallmentInput, PayInstallmentResult } from './installment-payment.types';
export declare function createInstallmentPaymentService(db: InstallmentPaymentPrismaClient): {
    payInstallment: (input: PayInstallmentInput) => Promise<PayInstallmentResult>;
    payBill: (input: PayInstallmentInput) => Promise<PayInstallmentResult>;
};
export declare const installmentPaymentService: {
    payInstallment: (input: PayInstallmentInput) => Promise<PayInstallmentResult>;
    payBill: (input: PayInstallmentInput) => Promise<PayInstallmentResult>;
};

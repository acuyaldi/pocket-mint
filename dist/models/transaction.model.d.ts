export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export interface CreateTransactionDto {
    userId?: string;
    walletId?: string;
    toWalletId?: string;
    categoryId?: string;
    type: TransactionType;
    amount: number;
    description?: string;
    note?: string;
    date?: string;
    isInstallment?: boolean;
    billingMode?: 'FULL' | 'INSTALLMENT';
    installmentMonths?: number;
    firstDueDate?: string;
    interestRate?: number;
    currentTerm?: number;
}
export interface UpdateTransactionDto {
    walletId?: string;
    toWalletId?: string;
    categoryId?: string;
    type?: TransactionType;
    amount?: number;
    description?: string;
    note?: string;
    date?: string;
    isInstallment?: boolean;
    installmentMonths?: number;
    currentTerm?: number;
}
export interface ListTransactionQuery {
    userId?: string;
    walletId?: string;
    type?: TransactionType;
    month?: string;
    year?: string;
    limit?: string;
}

import { type CreateTransactionInput, type UpdateTransactionInput, type DeleteTransactionInput, type DeleteTransactionResult, type TransactionPrismaClient, type CreateTransactionOptions, type TransactionWithRelations } from './transaction.types';
export declare function createTransactionService(db: TransactionPrismaClient): {
    createTransaction: (input: CreateTransactionInput, options?: CreateTransactionOptions) => Promise<TransactionWithRelations>;
    updateTransaction: (input: UpdateTransactionInput) => Promise<TransactionWithRelations>;
    deleteTransaction: (input: DeleteTransactionInput) => Promise<DeleteTransactionResult>;
};
/** Production instance bound to the shared Prisma singleton. */
export declare const transactionService: {
    createTransaction: (input: CreateTransactionInput, options?: CreateTransactionOptions) => Promise<TransactionWithRelations>;
    updateTransaction: (input: UpdateTransactionInput) => Promise<TransactionWithRelations>;
    deleteTransaction: (input: DeleteTransactionInput) => Promise<DeleteTransactionResult>;
};
export type TransactionService = ReturnType<typeof createTransactionService>;

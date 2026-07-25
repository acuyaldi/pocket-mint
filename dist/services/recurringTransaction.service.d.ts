import { type CreateRecurringTransactionInput, type UpdateRecurringTransactionInput, type DeleteRecurringTransactionInput, type DeleteRecurringTransactionResult, type RecurringTransactionPrismaClient, type RecurringTransactionWithRelations } from './recurringTransaction.types';
export declare function createRecurringTransactionService(db: RecurringTransactionPrismaClient): {
    listRecurringTransactions: (userId: string) => Promise<RecurringTransactionWithRelations[]>;
    createRecurringTransaction: (input: CreateRecurringTransactionInput) => Promise<RecurringTransactionWithRelations>;
    updateRecurringTransaction: (input: UpdateRecurringTransactionInput) => Promise<RecurringTransactionWithRelations>;
    deleteRecurringTransaction: (input: DeleteRecurringTransactionInput) => Promise<DeleteRecurringTransactionResult>;
};
export declare const recurringTransactionService: {
    listRecurringTransactions: (userId: string) => Promise<RecurringTransactionWithRelations[]>;
    createRecurringTransaction: (input: CreateRecurringTransactionInput) => Promise<RecurringTransactionWithRelations>;
    updateRecurringTransaction: (input: UpdateRecurringTransactionInput) => Promise<RecurringTransactionWithRelations>;
    deleteRecurringTransaction: (input: DeleteRecurringTransactionInput) => Promise<DeleteRecurringTransactionResult>;
};

export type RecurringTransactionType = 'INCOME' | 'EXPENSE';
export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type RecurringAmountMode = 'FIXED' | 'FLEXIBLE';
export interface CreateRecurringTransactionDto {
    name: string;
    walletId: string;
    categoryId?: string;
    type: RecurringTransactionType;
    amountMode: RecurringAmountMode;
    /** Required when amountMode is FIXED; ignored (stored as null) when FLEXIBLE. */
    amount?: number;
    description?: string;
    frequency: RecurrenceFrequency;
    startDate: string;
    endDate?: string;
    /** When true, reminderOffsetDays is required and must be one of 0/1/3/7. */
    reminderEnabled?: boolean;
    reminderOffsetDays?: number | null;
}
export interface UpdateRecurringTransactionDto {
    name?: string;
    walletId?: string;
    categoryId?: string;
    type?: RecurringTransactionType;
    amountMode?: RecurringAmountMode;
    amount?: number;
    description?: string;
    frequency?: RecurrenceFrequency;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
    reminderEnabled?: boolean;
    reminderOffsetDays?: number | null;
}

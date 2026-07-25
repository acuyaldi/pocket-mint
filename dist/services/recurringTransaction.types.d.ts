import type { PrismaClient, Prisma } from '../generated/prisma/client';
import type { RecurrenceFrequency, RecurringTransactionType, RecurringAmountMode } from '../models/recurringTransaction.model';
export type RecurringTransactionPrismaClient = Pick<PrismaClient, 'recurringTransactionTemplate' | 'wallet' | 'category'>;
/** Amount accepted from the controller; normalized to Decimal inside the service. */
export type DecimalInput = Prisma.Decimal | number | string;
export interface CreateRecurringTransactionInput {
    userId: string;
    name: string;
    walletId: string;
    categoryId?: string;
    type: RecurringTransactionType;
    amountMode: RecurringAmountMode;
    /** Required when amountMode is FIXED; ignored (stored as null) when FLEXIBLE. */
    amount?: DecimalInput;
    description?: string;
    frequency: RecurrenceFrequency;
    /** ISO day (`YYYY-MM-DD`) or offset timestamp; normalized in the service. */
    startDate: string;
    endDate?: string;
    reminderEnabled?: boolean;
    reminderOffsetDays?: number | null;
}
/** Update fields; `undefined` means "omitted" (keep the persisted value). */
export interface UpdateRecurringTransactionFields {
    name?: string;
    walletId?: string;
    categoryId?: string;
    type?: RecurringTransactionType;
    amountMode?: RecurringAmountMode;
    amount?: DecimalInput;
    description?: string;
    frequency?: RecurrenceFrequency;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
    reminderEnabled?: boolean;
    reminderOffsetDays?: number | null;
}
export interface UpdateRecurringTransactionInput extends UpdateRecurringTransactionFields {
    userId: string;
    id: string;
}
export interface DeleteRecurringTransactionInput {
    userId: string;
    id: string;
}
export declare const RECURRING_TRANSACTION_INCLUDE: {
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
export type RecurringTransactionWithRelations = Prisma.RecurringTransactionTemplateGetPayload<{
    include: typeof RECURRING_TRANSACTION_INCLUDE;
}>;
export interface DeleteRecurringTransactionResult {
    id: string;
}

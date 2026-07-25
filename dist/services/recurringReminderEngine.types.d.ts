import type { PrismaClient } from '../generated/prisma/client';
export type RecurringReminderEnginePrismaClient = Pick<PrismaClient, 'recurringTransactionTemplate' | 'installment' | 'recurringReminderEvent'>;
export interface RecurringReminderEvent {
    id: string;
    templateId: string | null;
    installmentId: string | null;
    userId: string;
    occurrenceDate: Date;
    offsetDays: number;
    reminderDate: Date;
    createdAt: Date;
}

import type { RecurringReminderEnginePrismaClient, RecurringReminderEvent } from './recurringReminderEngine.types';
/** Fixed lead time for installment due-date reminders — not user-configurable. */
export declare const INSTALLMENT_REMINDER_OFFSET_DAYS = 3;
export declare function createRecurringReminderEngineService(db: RecurringReminderEnginePrismaClient): {
    evaluateReminders: (evaluationDate: string, userId?: string) => Promise<RecurringReminderEvent[]>;
};
export declare const recurringReminderEngineService: {
    evaluateReminders: (evaluationDate: string, userId?: string) => Promise<RecurringReminderEvent[]>;
};

import { type NotificationPrismaClient, type NotificationWithTemplate, type MarkNotificationReadInput, type MarkAllNotificationsReadResult, type ConfirmReminderInput, type ConfirmReminderResult, type ListNotificationsInput, type ListNotificationsResult } from './notification.types';
export declare function createNotificationService(db: NotificationPrismaClient): {
    listNotifications: (input: ListNotificationsInput) => Promise<ListNotificationsResult>;
    refreshNotifications: (userId: string) => Promise<ListNotificationsResult>;
    markNotificationRead: (input: MarkNotificationReadInput) => Promise<NotificationWithTemplate>;
    markAllNotificationsRead: (userId: string) => Promise<MarkAllNotificationsReadResult>;
    confirmReminder: (input: ConfirmReminderInput) => Promise<ConfirmReminderResult>;
};
export declare const notificationService: {
    listNotifications: (input: ListNotificationsInput) => Promise<ListNotificationsResult>;
    refreshNotifications: (userId: string) => Promise<ListNotificationsResult>;
    markNotificationRead: (input: MarkNotificationReadInput) => Promise<NotificationWithTemplate>;
    markAllNotificationsRead: (userId: string) => Promise<MarkAllNotificationsReadResult>;
    confirmReminder: (input: ConfirmReminderInput) => Promise<ConfirmReminderResult>;
};

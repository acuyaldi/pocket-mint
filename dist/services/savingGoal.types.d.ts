import type { PrismaClient, Prisma } from '../generated/prisma/client';
export type SavingGoalPrismaClient = Pick<PrismaClient, 'savingGoal'>;
/** Amount accepted from the controller; normalized to Decimal inside the service. */
export type DecimalInput = Prisma.Decimal | number | string;
export interface CreateSavingGoalInput {
    userId: string;
    name: string;
    targetAmount: DecimalInput;
    /** Defaults to zero when omitted. */
    currentAmount?: DecimalInput;
    /** ISO day (`YYYY-MM-DD`) or offset timestamp; normalized in the service. */
    targetDate?: string;
    notes?: string;
}
export interface UpdateSavingGoalInput {
    userId: string;
    id: string;
    name?: string;
    targetAmount?: DecimalInput;
    /** `null` clears the target date; `undefined` means "omitted". */
    targetDate?: string | null;
    /** `null` clears notes; `undefined` means "omitted". */
    notes?: string | null;
}
export interface UpdateSavingGoalProgressInput {
    userId: string;
    id: string;
    currentAmount: DecimalInput;
}
export interface ArchiveSavingGoalInput {
    userId: string;
    id: string;
}
export interface GetSavingGoalInput {
    userId: string;
    id: string;
}
export type SavingGoalRecord = Prisma.SavingGoalGetPayload<Record<string, never>>;

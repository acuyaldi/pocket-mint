export type SavingGoalStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export interface CreateSavingGoalDto {
    name: string;
    targetAmount: number;
    /** Optional; defaults to zero when omitted. */
    currentAmount?: number;
    targetDate?: string;
    notes?: string;
}
export interface UpdateSavingGoalDto {
    name?: string;
    targetAmount?: number;
    targetDate?: string | null;
    notes?: string | null;
}
export interface UpdateSavingGoalProgressDto {
    currentAmount: number;
}

import { type ArchiveSavingGoalInput, type CreateSavingGoalInput, type GetSavingGoalInput, type SavingGoalPrismaClient, type SavingGoalRecord, type UpdateSavingGoalInput, type UpdateSavingGoalProgressInput } from './savingGoal.types';
export declare function createSavingGoalService(db: SavingGoalPrismaClient): {
    listSavingGoals: (userId: string) => Promise<SavingGoalRecord[]>;
    getSavingGoal: (input: GetSavingGoalInput) => Promise<SavingGoalRecord>;
    createSavingGoal: (input: CreateSavingGoalInput) => Promise<SavingGoalRecord>;
    updateSavingGoal: (input: UpdateSavingGoalInput) => Promise<SavingGoalRecord>;
    updateSavingGoalProgress: (input: UpdateSavingGoalProgressInput) => Promise<SavingGoalRecord>;
    archiveSavingGoal: (input: ArchiveSavingGoalInput) => Promise<SavingGoalRecord>;
};
export declare const savingGoalService: {
    listSavingGoals: (userId: string) => Promise<SavingGoalRecord[]>;
    getSavingGoal: (input: GetSavingGoalInput) => Promise<SavingGoalRecord>;
    createSavingGoal: (input: CreateSavingGoalInput) => Promise<SavingGoalRecord>;
    updateSavingGoal: (input: UpdateSavingGoalInput) => Promise<SavingGoalRecord>;
    updateSavingGoalProgress: (input: UpdateSavingGoalProgressInput) => Promise<SavingGoalRecord>;
    archiveSavingGoal: (input: ArchiveSavingGoalInput) => Promise<SavingGoalRecord>;
};

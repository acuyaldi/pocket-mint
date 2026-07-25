export interface CreateBudgetDto {
    categoryId: string;
    amount: number;
}
export interface UpdateBudgetAmountDto {
    amount: number;
}
export type BudgetListStatus = 'active' | 'archived';

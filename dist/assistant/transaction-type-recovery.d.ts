export type RecoveredTransactionType = 'EXPENSE' | 'INCOME';
/**
 * Defensive transaction-type recovery for provider misses only.
 * This intentionally recognizes one unambiguous Indonesian type signal and no
 * amount, wallet, category, merchant, or date semantics.
 */
export declare function recoverExplicitTransactionType(message: string): RecoveredTransactionType | null;

/**
 * Defensive amount recovery for provider misses only.
 * This intentionally recognizes one explicit Indonesian rupiah amount and no
 * wallet/category/date/merchant/transaction semantics.
 */
export declare function recoverSingleExplicitIndonesianAmount(message: string): string | null;

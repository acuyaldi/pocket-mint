export type RecoveredTransactionType = 'EXPENSE' | 'INCOME';

const EXPENSE_SIGNALS = [
  /\bbayar\b/iu,
  /\bbeli\b/iu,
  /\bbelanja\b/iu,
  /\bkeluar\b/iu,
  /\btagihan\b/iu,
  /\blangganan\b/iu,
  /\btop\s?up\b/iu,
  /\bisi\s+bensin\b/iu,
  /\btransfer\s+untuk\s+membayar\b/iu,
  /\bpotong\s+saldo\b/iu,
  /\bdebit\b/iu,
];

const INCOME_SIGNALS = [
  /\bterima\b/iu,
  /\bdapat\b/iu,
  /\bmasuk\b/iu,
  /\bgaji\b/iu,
  /\bbonus\b/iu,
  /\brefund\b/iu,
  /\bcashback\b/iu,
  /\bbunga\b/iu,
  /\bdividen\b/iu,
  /\bdibayar\s+oleh\b/iu,
];

function hasAnySignal(message: string, signals: readonly RegExp[]): boolean {
  return signals.some((signal) => signal.test(message));
}

/**
 * Defensive transaction-type recovery for provider misses only.
 * This intentionally recognizes one unambiguous Indonesian type signal and no
 * amount, wallet, category, merchant, or date semantics.
 */
export function recoverExplicitTransactionType(message: string): RecoveredTransactionType | null {
  const normalized = message.normalize('NFKC').toLowerCase();
  const hasExpense = hasAnySignal(normalized, EXPENSE_SIGNALS);
  const hasIncome = hasAnySignal(normalized, INCOME_SIGNALS);
  if (hasExpense === hasIncome) return null;
  return hasExpense ? 'EXPENSE' : 'INCOME';
}

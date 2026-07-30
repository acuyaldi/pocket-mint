import { describe, expect, it } from 'vitest';
import { recoverExplicitTransactionType } from '../../src/assistant/transaction-type-recovery';

describe('recoverExplicitTransactionType', () => {
  it.each([
    ['bayar internet', 'EXPENSE'],
    ['beli makan', 'EXPENSE'],
    ['belanja bulanan', 'EXPENSE'],
    ['gaji masuk', 'INCOME'],
    ['terima pembayaran', 'INCOME'],
  ] as const)('recovers one explicit Indonesian transaction type: %s', (message, type) => {
    expect(recoverExplicitTransactionType(message)).toBe(type);
  });

  it.each([
    'terima uang lalu bayar listrik',
    'transfer uang',
    'uang masuk untuk bayar internet',
  ])('declines ambiguous or conflicting transaction type recovery: %s', (message) => {
    expect(recoverExplicitTransactionType(message)).toBeNull();
  });
});

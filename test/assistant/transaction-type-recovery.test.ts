import { describe, expect, it } from 'vitest';
import { recoverExplicitTransactionType } from '../../src/assistant/transaction-type-recovery';

describe('recoverExplicitTransactionType', () => {
  it.each([
    ['bayar internet', 'EXPENSE'],
    ['beli makan', 'EXPENSE'],
    ['belanja bulanan', 'EXPENSE'],
    ['tagihan listrik 200rb', 'EXPENSE'],
    ['langganan netflix', 'EXPENSE'],
    ['top up gopay 100rb', 'EXPENSE'],
    ['topup gopay 100rb', 'EXPENSE'],
    ['isi bensin 50rb', 'EXPENSE'],
    ['transfer keluar 250rb', 'EXPENSE'],
    ['gaji masuk', 'INCOME'],
    ['gaji 5 juta', 'INCOME'],
    ['bonus tahunan', 'INCOME'],
    ['refund tokopedia', 'INCOME'],
    ['cashback ovo', 'INCOME'],
    ['bunga deposito', 'INCOME'],
    ['dividen saham', 'INCOME'],
    ['terima pembayaran', 'INCOME'],
  ] as const)('recovers one explicit Indonesian transaction type: %s', (message, type) => {
    expect(recoverExplicitTransactionType(message)).toBe(type);
  });

  it.each([
    'terima uang lalu bayar listrik',
    'transfer uang',
    'uang masuk untuk bayar internet',
    'beli bunga 50rb',
    'bayar bonus karyawan',
  ])('declines ambiguous or conflicting transaction type recovery: %s', (message) => {
    expect(recoverExplicitTransactionType(message)).toBeNull();
  });
});

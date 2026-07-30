import { describe, expect, it } from 'vitest';
import { recoverSingleExplicitIndonesianAmount } from '../../src/assistant/rupiah-amount-recovery';

describe('recoverSingleExplicitIndonesianAmount', () => {
  it.each([
    ['350rb', '350000'],
    ['350 rb', '350000'],
    ['350ribu', '350000'],
    ['350 ribu', '350000'],
    ['Rp350rb', '350000'],
    ['Rp350.000', '350000'],
    ['350.000', '350000'],
    ['350000', '350000'],
    ['1jt', '1000000'],
    ['1 jt', '1000000'],
    ['1juta', '1000000'],
    ['1 juta', '1000000'],
    ['1,5jt', '1500000'],
    ['1.5 juta', '1500000'],
  ])('returns the canonical amount for one explicit amount: %s', (message, amount) => {
    expect(recoverSingleExplicitIndonesianAmount(`bayar internet ${message} dari bca`)).toBe(amount);
  });

  it.each([
    'bayar listrik 300rb lalu internet 500rb',
    'antara 300rb atau 400rb',
    'transfer 1jt lalu bayar admin 10rb',
    'cicilan 12 bulan 350rb',
    'beli 2 barang 350rb dan 200rb',
  ])('declines ambiguous or multi-number recovery: %s', (message) => {
    expect(recoverSingleExplicitIndonesianAmount(message)).toBeNull();
  });

  it.each([
    'bayar internet tanggal 30',
    'bayar cicilan bulan ke 12',
    'beli 2 barang',
    'transfer ke rekening 123456789',
    'bayar internet 0rb',
    'bayar internet -350rb',
    'bayar internet 350k',
    'bayar internet 350r',
    'bayar internet setengah juta',
    'bayar internet 99999999999999',
  ])('declines invalid or unsupported numeric text: %s', (message) => {
    expect(recoverSingleExplicitIndonesianAmount(message)).toBeNull();
  });
});

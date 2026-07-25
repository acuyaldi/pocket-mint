// ============================================================
// Tests: tool contract validation (monthly-spending-summary)
// ============================================================
import { describe, expect, it } from 'vitest';
import { monthlySpendingSummary, transactionCreate, AssistantError } from '../../src/assistant';

// ---- Tests: input validation -----------------------------------------------

describe('monthlySpendingSummary input validation', () => {
  it('accepts a valid YYYY-MM month string', () => {
    const result = monthlySpendingSummary.validateInput({ month: '2026-01' });
    expect(result).toEqual({ month: '2026-01' });
  });

  it('accepts December (12)', () => {
    const result = monthlySpendingSummary.validateInput({ month: '2026-12' });
    expect(result).toEqual({ month: '2026-12' });
  });

  it('accepts January with leading zero (01)', () => {
    const result = monthlySpendingSummary.validateInput({ month: '2026-01' });
    expect(result).toEqual({ month: '2026-01' });
  });

  it('rejects month 00', () => {
    expect(() =>
      monthlySpendingSummary.validateInput({ month: '2026-00' }),
    ).toThrow(AssistantError);
  });

  it('rejects month 13', () => {
    expect(() =>
      monthlySpendingSummary.validateInput({ month: '2026-13' }),
    ).toThrow(AssistantError);
  });

  it('rejects a malformed month string (no hyphen)', () => {
    expect(() =>
      monthlySpendingSummary.validateInput({ month: '202601' }),
    ).toThrow(AssistantError);
  });

  it('rejects a non-string month', () => {
    expect(() =>
      monthlySpendingSummary.validateInput({ month: 202601 }),
    ).toThrow(AssistantError);
  });

  it('rejects a missing month field', () => {
    expect(() => monthlySpendingSummary.validateInput({})).toThrow(
      AssistantError,
    );
  });

  it('rejects null input', () => {
    expect(() => monthlySpendingSummary.validateInput(null)).toThrow(
      AssistantError,
    );
  });

  it('rejects non-object input (string)', () => {
    expect(() =>
      monthlySpendingSummary.validateInput('2026-01'),
    ).toThrow(AssistantError);
  });

  it('rejects non-object input (array)', () => {
    expect(() => monthlySpendingSummary.validateInput(['2026-01'])).toThrow(
      AssistantError,
    );
  });

  it('input schema has no userId field — caller identity comes from ExecutionContext', () => {
    // Verify the validator does not accept or require a userId field.
    // The execution engine (Phase 21.2) supplies userId via ExecutionContext,
    // never from the tool input.
    expect(() =>
      monthlySpendingSummary.validateInput({ month: '2026-01', userId: 'hacker' }),
    ).not.toThrow();
    // The extra userId field is silently ignored — validation only cares about
    // the month field. The execution engine never merges tool input into context.
  });
});

describe('transaction.create input validation', () => {
  const valid = { type: 'EXPENSE', amount: '12500.50', walletId: 'wallet-1', categoryId: 'category-1', date: '2026-07-22', description: 'Lunch' };
  const referenceValid = { type: 'EXPENSE', amount: '12500.50', walletReference: 'BCA', merchantReference: 'Starbucks', categoryReference: 'Food', date: '2026-07-22', description: 'Lunch' };
  // Validation normalises categoryId to '' when only categoryReference is supplied
  const referenceValidOutput = { ...referenceValid, categoryId: '' };

  it('preserves walletId compatibility for deterministic internal callers', () => {
    expect(transactionCreate.validateInput(valid)).toEqual(valid);
  });

  it('accepts a textual walletReference without accepting both wallet forms', () => {
    expect(transactionCreate.validateInput(referenceValid)).toEqual(referenceValidOutput);
    expect(() => transactionCreate.validateInput({
      ...referenceValid,
      walletId: 'provider-must-not-send-this',
    })).toThrow(AssistantError);
  });

  it('accepts categoryReference alongside optional categoryId for entity resolution', () => {
    expect(transactionCreate.validateInput(valid)).toEqual(valid);
    expect(transactionCreate.validateInput(referenceValid)).toEqual(referenceValidOutput);
    // Both categoryId and categoryReference together are accepted (not mutually exclusive)
    expect(transactionCreate.validateInput({
      ...referenceValid,
      categoryId: 'category-1',
    })).toEqual({ ...referenceValidOutput, categoryId: 'category-1' });
    // At least one category form is required
    const { categoryReference: _cr, categoryId: _cid, ...noCategory } = referenceValid;
    expect(() => transactionCreate.validateInput(noCategory)).toThrow(AssistantError);
  });

  it.each([
    [{ ...valid, amount: 0 }],
    [{ ...valid, amount: 1.25 }],
    [{ ...valid, amount: '1.234' }],
    [{ ...valid, date: '2026-02-30' }],
    [{ ...valid, description: '   ' }],
    [{ ...valid, type: 'TRANSFER' }],
    [{ ...valid, userId: 'attacker' }],
    [{ ...valid, balance: 999 }],
    [{ ...valid, extra: true }],
    [{ ...valid, categoryId: undefined }],
    [{ ...referenceValid, walletReference: '   ' }],
    [{ ...referenceValid, merchantReference: '   ' }],
    [{ ...referenceValid, categoryReference: '   ' }],
    [{ ...referenceValid, merchantId: 'merchant-1' }],
    [{ ...referenceValid, merchantMappingId: 'mapping-1' }],
    [{ ...referenceValid, categoryIds: ['category-1'] }],
    [{ ...referenceValid, categoryIdentifier: 'category-1' }],
    [{ ...referenceValid, categoryInternalId: 'category-1' }],
    [{ ...referenceValid, categoryMappingId: 'category-1' }],
    [{ ...referenceValid, ownerId: 'attacker' }],
    [{ ...referenceValid, categoryOwnerId: 'attacker' }],
    [{ ...referenceValid, categoryType: 'EXPENSE' }],
    [{ ...referenceValid, confidence: 1000 }],
    [{ ...referenceValid, evidence: ['provider-claim'] }],
    [{ ...referenceValid, trustedConstraints: { transactionType: 'EXPENSE' } }],
    [{ ...referenceValid, archived: false }],
    [{ ...referenceValid, authorized: true }],
    [{ ...referenceValid, confirmationComplete: true }],
    [{ ...referenceValid, ['ｃａｔｅｇｏｒｙＩｄ']: 'category-1' }],
  ])('rejects unsafe or invalid arguments %#', (input) => {
    expect(() => transactionCreate.validateInput(input)).toThrow(AssistantError);
  });

  it('exposes walletReference and categoryId in provider metadata', () => {
    expect(transactionCreate.providerArguments.required).toContain('walletReference');
    expect(transactionCreate.providerArguments.required).toContain('categoryId');
    expect(transactionCreate.providerArguments.required).not.toContain('walletId');
    expect(transactionCreate.providerArguments.required).not.toContain('merchantReference');
    expect(transactionCreate.providerArguments.required).not.toContain('categoryReference');
    expect(transactionCreate.providerArguments.properties).toHaveProperty('walletReference');
    expect(transactionCreate.providerArguments.properties).toHaveProperty('categoryId');
    expect(transactionCreate.providerArguments.properties).not.toHaveProperty('walletId');
    expect(transactionCreate.providerArguments.properties).not.toHaveProperty('categoryIdentifier');
    expect(transactionCreate.providerArguments.properties).not.toHaveProperty('categoryInternalId');
    expect(transactionCreate.providerArguments.properties).not.toHaveProperty('categoryMappingId');
    expect(transactionCreate.providerArguments.properties).not.toHaveProperty('merchantReference');
    expect(transactionCreate.providerArguments.properties).not.toHaveProperty('merchantId');
    expect(transactionCreate.providerArguments.properties).not.toHaveProperty('merchantMappingId');
    expect(transactionCreate.providerArguments.properties).not.toHaveProperty('categoryReference');
  });
});

// ---- Tests: output validation ----------------------------------------------

describe('monthlySpendingSummary output validation', () => {
  function makeValidOutput() {
    return {
      month: '2026-01',
      totalIncome: 5_000_000,
      totalExpense: 3_200_000,
      netSavings: 1_800_000,
      transactionCount: 42,
      topCategories: [
        { name: 'Food', amount: 1_200_000, percentage: 37.5 },
        { name: 'Transport', amount: 800_000, percentage: 25 },
      ],
    };
  }

  it('accepts a structurally valid output', () => {
    const output = makeValidOutput();
    const result = monthlySpendingSummary.validateOutput(output);
    expect(result).toEqual(output);
  });

  it('rejects output missing totalIncome', () => {
    const output = makeValidOutput();
    delete (output as Record<string, unknown>).totalIncome;
    expect(() => monthlySpendingSummary.validateOutput(output)).toThrow(
      AssistantError,
    );
  });

  it('rejects output missing topCategories array', () => {
    const output = makeValidOutput();
    delete (output as Record<string, unknown>).topCategories;
    expect(() => monthlySpendingSummary.validateOutput(output)).toThrow(
      AssistantError,
    );
  });

  it('rejects output with totalIncome as string instead of number', () => {
    const output = { ...makeValidOutput(), totalIncome: '5000000' };
    expect(() => monthlySpendingSummary.validateOutput(output)).toThrow(
      AssistantError,
    );
  });

  it('rejects null output', () => {
    expect(() => monthlySpendingSummary.validateOutput(null)).toThrow(
      AssistantError,
    );
  });

  it('rejects non-object output', () => {
    expect(() =>
      monthlySpendingSummary.validateOutput('not an object'),
    ).toThrow(AssistantError);
  });

  it('rejects NaN totalIncome', () => {
    const output = { ...makeValidOutput(), totalIncome: NaN };
    expect(() => monthlySpendingSummary.validateOutput(output)).toThrow(
      AssistantError,
    );
  });

  it('rejects Infinity totalExpense', () => {
    const output = { ...makeValidOutput(), totalExpense: Infinity };
    expect(() => monthlySpendingSummary.validateOutput(output)).toThrow(
      AssistantError,
    );
  });

  it('rejects -Infinity netSavings', () => {
    const output = { ...makeValidOutput(), netSavings: -Infinity };
    expect(() => monthlySpendingSummary.validateOutput(output)).toThrow(
      AssistantError,
    );
  });

  it('rejects non-integer transactionCount', () => {
    const output = { ...makeValidOutput(), transactionCount: 3.5 };
    expect(() => monthlySpendingSummary.validateOutput(output)).toThrow(
      AssistantError,
    );
  });

  it('rejects negative transactionCount', () => {
    const output = { ...makeValidOutput(), transactionCount: -1 };
    expect(() => monthlySpendingSummary.validateOutput(output)).toThrow(
      AssistantError,
    );
  });
});

// ---- Tests: contract metadata ----------------------------------------------

describe('monthlySpendingSummary contract metadata', () => {
  it('is an analytics read capability', () => {
    expect(monthlySpendingSummary.capability).toBe('analytics.read');
  });

  it('is LOW risk', () => {
    expect(monthlySpendingSummary.riskLevel).toBe('LOW');
  });

  it('requires no confirmation', () => {
    expect(monthlySpendingSummary.confirmationPolicy).toBe('NONE');
  });

  it('has a positive timeout', () => {
    expect(monthlySpendingSummary.timeoutMs).toBeGreaterThan(0);
  });

  it('is enabled', () => {
    expect(monthlySpendingSummary.enabled).toBe(true);
  });

  it('does not require idempotency (read is naturally idempotent)', () => {
    expect(monthlySpendingSummary.idempotencyPolicy).toBe('NOT_REQUIRED');
  });

  it('has a stable tool ID', () => {
    expect(monthlySpendingSummary.id).toBe('analytics.monthly-spending-summary');
  });

  it('has a human-readable description', () => {
    expect(monthlySpendingSummary.description.length).toBeGreaterThan(0);
  });

  it('does not import or reference any provider-specific type', () => {
    // Verify the contract shape contains no vendor-specific fields.
    // The ToolContract type ensures this at compile time; this test
    // verifies the runtime object has no accidental extras.
    const allowedKeys = new Set([
      'id', 'description', 'capability', 'riskLevel',
      'confirmationPolicy', 'idempotencyPolicy', 'timeoutMs',
      'enabled', 'providerArguments', 'validateInput', 'validateOutput',
    ]);
    for (const key of Object.keys(monthlySpendingSummary)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });
});

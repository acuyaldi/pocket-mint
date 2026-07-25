// ============================================================
// Assistant Core — registered tool definitions
// ------------------------------------------------------------
// Each export is a ToolContract that can be registered with the
// ToolRegistry. These are provider-neutral definitions — the
// provider adapter generates vendor-specific schemas from them.
//
// Phase 21.1 defines only the contract shapes; execution handlers
// are wired in Phase 21.2.
// ============================================================

import type { ToolContract } from './types';
import { AssistantError } from './errors';

export interface TransactionCreateInput {
  type: 'INCOME' | 'EXPENSE';
  amount: string;
  walletId: string;
  categoryId: string;
  date: string;
  description?: string;
}

export interface TransactionCreateReferenceInput {
  type: 'INCOME' | 'EXPENSE';
  amount: string;
  walletReference: string;
  categoryId: string;
  date: string;
  description?: string;
  /** Optional merchant name reference — used for merchant resolution. */
  merchantReference?: string;
  /** Optional category name reference — used for category resolution. */
  categoryReference?: string;
}

export type TransactionCreateToolInput =
  | TransactionCreateInput
  | TransactionCreateReferenceInput;

const TRANSACTION_KEYS = new Set([
  'type',
  'amount',
  'walletId',
  'walletReference',
  'categoryId',
  'categoryReference',
  'merchantReference',
  'date',
  'description',
]);
const MONEY_RE = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDay(value: string): boolean {
  if (!DAY_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function validateTransactionCreateInput(input: unknown): TransactionCreateToolInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw AssistantError.invalidInput('transaction.create', 'Input must be a non-null object');
  }
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !TRANSACTION_KEYS.has(key))) {
    throw AssistantError.invalidInput('transaction.create', 'Input contains unsupported properties');
  }
  if (value.type !== 'INCOME' && value.type !== 'EXPENSE') {
    throw AssistantError.invalidInput('transaction.create', 'type must be INCOME or EXPENSE');
  }
  const amount = value.amount;
  if (typeof amount !== 'string' || !MONEY_RE.test(amount) || amount === '0' || /^0(?:\.0{1,2})?$/.test(amount)) {
    throw AssistantError.invalidInput('transaction.create', 'amount must be a positive decimal with at most two fraction digits');
  }
  const hasWalletId = value.walletId !== undefined;
  const hasWalletReference = value.walletReference !== undefined;
  if (hasWalletId === hasWalletReference) {
    throw AssistantError.invalidInput(
      'transaction.create',
      'exactly one of walletId or walletReference is required',
    );
  }
  if (
    hasWalletId
    && (typeof value.walletId !== 'string'
      || !value.walletId.trim()
      || value.walletId.length > 191)
  ) {
    throw AssistantError.invalidInput(
      'transaction.create',
      'walletId must be a non-empty bounded string',
    );
  }
  if (
    hasWalletReference
    && (typeof value.walletReference !== 'string'
      || !value.walletReference.trim()
      || value.walletReference.length > 256)
  ) {
    throw AssistantError.invalidInput(
      'transaction.create',
      'walletReference must be a non-empty bounded string',
    );
  }
  const hasCategoryRef = typeof value.categoryReference === 'string' && value.categoryReference.trim().length > 0;
  const catId = value.categoryId;
  const hasCategoryId = typeof catId === 'string' && catId.trim().length > 0 && catId.length <= 191;
  if (!hasCategoryId && !hasCategoryRef) {
    throw AssistantError.invalidInput(
      'transaction.create',
      'categoryId or categoryReference is required',
    );
  }
  if (typeof value.date !== 'string' || !isCalendarDay(value.date)) {
    throw AssistantError.invalidInput('transaction.create', 'date must be a valid YYYY-MM-DD day');
  }
  if (value.description !== undefined && (typeof value.description !== 'string' || !value.description.trim() || value.description.length > 500)) {
    throw AssistantError.invalidInput('transaction.create', 'description must be at most 500 characters');
  }
  if (value.merchantReference !== undefined) {
    if (typeof value.merchantReference !== 'string' || !value.merchantReference.trim()) {
      throw AssistantError.invalidInput('transaction.create', 'merchantReference must be a non-empty string');
    }
  }
  if (value.categoryReference !== undefined) {
    if (typeof value.categoryReference !== 'string' || !value.categoryReference.trim()) {
      throw AssistantError.invalidInput('transaction.create', 'categoryReference must be a non-empty string');
    }
  }
  const ext: Partial<Pick<TransactionCreateReferenceInput, 'merchantReference' | 'categoryReference'>> = {};
  if (value.merchantReference !== undefined) {
    ext.merchantReference = (value.merchantReference as string).trim();
  }
  if (value.categoryReference !== undefined) {
    ext.categoryReference = (value.categoryReference as string).trim();
  }

  const common: Omit<TransactionCreateInput, 'walletId'> = {
    type: value.type,
    amount,
    categoryId: (hasCategoryId ? value.categoryId : '') as string,
    date: value.date,
    ...(value.description === undefined ? {} : { description: (value.description as string).trim() }),
  };
  return hasWalletId
    ? { ...common, walletId: value.walletId as string, ...ext }
    : { ...common, walletReference: value.walletReference as string, ...ext };
}

// ---- Validation helpers ----------------------------------------------------

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function validateMonthInput(input: unknown): { month: string } {
  if (typeof input !== 'object' || input === null) {
    throw AssistantError.invalidInput(
      'analytics.monthly-spending-summary',
      'Input must be a non-null object',
    );
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.month !== 'string' || !MONTH_RE.test(obj.month)) {
    throw AssistantError.invalidInput(
      'analytics.monthly-spending-summary',
      'month must be a string in YYYY-MM format (e.g. "2026-01")',
    );
  }
  return { month: obj.month };
}

// ---- Output shape ----------------------------------------------------------

/**
 * One category row in the monthly spending summary. Mirrors the
 * existing AnalyticsCategoryBreakdownItem shape in terminology but
 * uses `number` (not Decimal) at the tool boundary — the execution
 * layer handles conversion.
 */
interface MonthlyCategoryBreakdown {
  name: string;
  amount: number;
  percentage: number | null;
}

/**
 * Structured result for `analytics.monthly-spending-summary`.
 * Combines the monthly summary (TransactionSummaryResult) and the
 * top expense-category breakdown into one read-only response.
 * All money amounts are numbers — the execution engine converts
 * from Decimal at the tool boundary.
 */
interface MonthlySpendingSummaryOutput {
  month: string;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  transactionCount: number;
  topCategories: MonthlyCategoryBreakdown[];
}

function validateMonthlySpendingOutput(
  output: unknown,
): MonthlySpendingSummaryOutput {
  // TypeScript types alone don't validate model-produced input at runtime
  // (§23 of the ADR). This is a minimal structural check; it is compatible
  // with adopting JSON Schema or Zod later without changing the contract.
  if (typeof output !== 'object' || output === null) {
    throw AssistantError.invalidOutput(
      'analytics.monthly-spending-summary',
      'Output must be a non-null object',
    );
  }
  const o = output as Record<string, unknown>;

  if (typeof o.month !== 'string')
    throw AssistantError.invalidOutput('analytics.monthly-spending-summary', 'month must be a string');
  if (typeof o.totalIncome !== 'number')
    throw AssistantError.invalidOutput('analytics.monthly-spending-summary', 'totalIncome must be a number');
  if (!Number.isFinite(o.totalIncome))
    throw AssistantError.invalidOutput('analytics.monthly-spending-summary', 'totalIncome must be a finite number');
  if (typeof o.totalExpense !== 'number')
    throw AssistantError.invalidOutput('analytics.monthly-spending-summary', 'totalExpense must be a number');
  if (!Number.isFinite(o.totalExpense))
    throw AssistantError.invalidOutput('analytics.monthly-spending-summary', 'totalExpense must be a finite number');
  if (typeof o.netSavings !== 'number')
    throw AssistantError.invalidOutput('analytics.monthly-spending-summary', 'netSavings must be a number');
  if (!Number.isFinite(o.netSavings))
    throw AssistantError.invalidOutput('analytics.monthly-spending-summary', 'netSavings must be a finite number');
  if (typeof o.transactionCount !== 'number')
    throw AssistantError.invalidOutput('analytics.monthly-spending-summary', 'transactionCount must be a number');
  if (!Number.isInteger(o.transactionCount) || o.transactionCount < 0)
    throw AssistantError.invalidOutput('analytics.monthly-spending-summary', 'transactionCount must be a non-negative integer');
  if (!Array.isArray(o.topCategories))
    throw AssistantError.invalidOutput('analytics.monthly-spending-summary', 'topCategories must be an array');

  return o as unknown as MonthlySpendingSummaryOutput;
}

// ---- Tool contract ---------------------------------------------------------

/**
 * First read-only vertical-slice tool (§7 of the Phase 21.1 brief):
 *
 * Returns a structured summary of the authenticated user's spending
 * for a requested Jakarta calendar month.
 *
 * - Risk: LOW (read-only analytics)
 * - Confirmation: NONE
 * - Idempotency: NOT_REQUIRED (read is naturally idempotent)
 * - Timeout: 10 seconds
 */
export const monthlySpendingSummary: ToolContract<
  { month: string },
  MonthlySpendingSummaryOutput
> = {
  id: 'analytics.monthly-spending-summary',
  description:
    "Return a structured summary of the user's spending for a Jakarta calendar month (YYYY-MM). Includes total income, total expense, net savings, transaction count, and the top expense categories with percentages.",
  capability: 'analytics.read',
  riskLevel: 'LOW',
  confirmationPolicy: 'NONE',
  idempotencyPolicy: 'NOT_REQUIRED',
  timeoutMs: 10_000,
  enabled: true,
  providerArguments: {
    required: ['month'],
    optional: [],
    properties: {
      month: { type: 'string', format: 'YYYY-MM', description: 'Jakarta reporting month.' },
    },
  },
  validateInput: validateMonthInput,
  validateOutput: validateMonthlySpendingOutput,
};

export const transactionCreate: ToolContract<
  TransactionCreateToolInput,
  TransactionCreateToolInput
> = {
  id: 'transaction.create',
  description: 'Prepare a regular income or expense transaction draft. A separate explicit confirmation is required before creation.',
  capability: 'transaction.create',
  riskLevel: 'HIGH',
  confirmationPolicy: 'EXPLICIT',
  idempotencyPolicy: 'REQUIRED',
  timeoutMs: 10_000,
  enabled: true,
  providerArguments: {
    required: ['amount', 'categoryId', 'date', 'type', 'walletReference'],
    optional: ['description'],
    properties: {
      amount: { type: 'string', description: 'Positive decimal amount with at most two fraction digits.' },
      categoryId: { type: 'string', description: 'Category identifier supplied by the user; never invent one.' },
      date: { type: 'string', format: 'YYYY-MM-DD', description: 'Transaction calendar date.' },
      description: { type: 'string', description: 'Optional short transaction description.' },
      type: { type: 'string', enum: ['INCOME', 'EXPENSE'], description: 'Regular transaction type.' },
      walletReference: { type: 'string', description: 'Textual wallet name or alias from the user; never supply a wallet identifier.' },
    },
  },
  validateInput: validateTransactionCreateInput,
  validateOutput: validateTransactionCreateInput,
  auditRedact: ['amount', 'description', 'walletId', 'walletReference', 'categoryId', 'date'],
};

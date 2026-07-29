import { transactionCreate } from './tools';

const AMOUNT_TOKEN_RE = /(?:\bRp\s*)?\d[\d.,]*(?:\s*(?:rb|ribu|jt|juta)\b)?/giu;
const NUMERIC_TOKEN_RE = /\d[\d.,]*/gu;
const SUFFIX_RE = /^(?:Rp\s*)?([1-9]\d*(?:[,.]\d{1,2})?)\s*(rb|ribu|jt|juta)$/iu;
const PLAIN_INTEGER_RE = /^(?:Rp\s*)?([1-9]\d{4,7})$/iu;
const GROUPED_RUPIAH_RE = /^(?:Rp\s*)?([1-9]\d{0,2}(?:\.\d{3})+)$/iu;

interface Candidate {
  readonly start: number;
  readonly end: number;
  readonly amount: string;
}

function canonicalIfValid(amount: string): string | null {
  try {
    transactionCreate.validateInput({
      type: 'EXPENSE',
      amount,
      walletReference: 'amount-recovery-wallet',
    });
    return amount;
  } catch {
    return null;
  }
}

function normalizeIntegerText(value: string): string | null {
  const normalized = value.replace(/\./g, '');
  return canonicalIfValid(normalized);
}

function normalizeSuffixText(value: string, suffix: string): string | null {
  const base = Number(value.replace(',', '.'));
  if (!Number.isFinite(base) || base <= 0) return null;
  const multiplier = suffix.toLowerCase() === 'jt' || suffix.toLowerCase() === 'juta'
    ? 1_000_000
    : 1_000;
  const amount = base * multiplier;
  if (!Number.isInteger(amount)) return null;
  return canonicalIfValid(String(amount));
}

function parseSupportedToken(raw: string): string | null {
  const token = raw.replace(/\s+/g, ' ').trim();
  const suffix = token.match(SUFFIX_RE);
  if (suffix) return normalizeSuffixText(suffix[1]!, suffix[2]!);
  const grouped = token.match(GROUPED_RUPIAH_RE);
  if (grouped) return normalizeIntegerText(grouped[1]!);
  const plain = token.match(PLAIN_INTEGER_RE);
  if (plain) return canonicalIfValid(plain[1]!);
  return null;
}

function hasNegativeSignBefore(message: string, start: number): boolean {
  return message.slice(Math.max(0, start - 2), start).includes('-');
}

function containsNumericOutsideCandidates(message: string, candidates: readonly Candidate[]): boolean {
  for (const match of message.matchAll(NUMERIC_TOKEN_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const covered = candidates.some((candidate) => start >= candidate.start && end <= candidate.end);
    if (!covered) return true;
  }
  return false;
}

/**
 * Defensive amount recovery for provider misses only.
 * This intentionally recognizes one explicit Indonesian rupiah amount and no
 * wallet/category/date/merchant/transaction semantics.
 */
export function recoverSingleExplicitIndonesianAmount(message: string): string | null {
  const candidates: Candidate[] = [];
  for (const match of message.matchAll(AMOUNT_TOKEN_RE)) {
    const start = match.index ?? 0;
    if (hasNegativeSignBefore(message, start)) continue;
    const amount = parseSupportedToken(match[0]);
    if (!amount) continue;
    candidates.push({ start, end: start + match[0].length, amount });
  }
  if (candidates.length !== 1) return null;
  if (containsNumericOutsideCandidates(message, candidates)) return null;
  return candidates[0]!.amount;
}

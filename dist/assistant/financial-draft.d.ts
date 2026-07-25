import type { TransactionCreateInput } from './tools';
export declare const ASSISTANT_FINANCIAL_DRAFT_TTL_MS: number;
export declare function validateIdempotencyKey(value: unknown): string;
export declare function renderTransactionDraftPreview(input: TransactionCreateInput, walletDisplayLabel: string | undefined, categoryDisplayLabel: string, merchantDisplayLabel?: string): string;

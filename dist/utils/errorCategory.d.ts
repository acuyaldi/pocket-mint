import type { ErrorCategory } from './logger';
/**
 * Map a real application error to a bounded, low-cardinality category for
 * logging. Never derived from the raw exception message — only from the
 * error's own type/code (or, for `ASSISTANT_DRAFT_CONFLICT`, its structured
 * `detail`, which is a draft status enum value, not user content).
 */
export declare function categorizeError(err: unknown): ErrorCategory;

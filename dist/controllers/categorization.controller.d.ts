import type { NextFunction, Request, Response } from 'express';
/**
 * GET /api/v1/categories/suggestions?description=...&type=EXPENSE
 *
 * Returns up to 5 ranked category suggestions for the given
 * transaction description. Suggestions are ordered by confidence
 * (HIGH → MEDIUM → LOW).
 *
 * Query params:
 *   description — the transaction description/merchant text
 *   type        — "INCOME" or "EXPENSE" (default: "EXPENSE")
 */
export declare function getSuggestions(req: Request, res: Response, next: NextFunction): Promise<void>;

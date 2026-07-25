import type { ParsedQs } from 'qs';
/** The shape of a single `req.query[...]` value as typed by Express. */
export type QueryValue = string | ParsedQs | (string | ParsedQs)[] | undefined;
/**
 * Reduce a query value to a single scalar string, or `undefined`.
 * - a string is returned as-is;
 * - an array collapses to the scalar form of its first element (repeated params);
 * - a nested object (never a scalar) becomes `undefined` — it is not coerced to
 *   `"[object Object]"`.
 */
export declare function scalarString(value: QueryValue): string | undefined;
/**
 * Parse an optional integer from a query value. Non-scalar, empty, and
 * non-numeric inputs yield `undefined` — the same lenient outcome the old
 * `parseInt`-based helper produced, so the service still applies its
 * clamp/default. `NaN` never reaches the service.
 */
export declare function scalarInt(value: QueryValue): number | undefined;
/**
 * A boolean flag that is `true` only when the scalar value is exactly `'true'`.
 * Preserves the existing `?force=true` semantics (any other value → `false`),
 * while safely collapsing an array/object shape first.
 */
export declare function scalarBooleanTrue(value: QueryValue): boolean;

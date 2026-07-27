/**
 * Minimal structured logger.
 *
 * Emits single-line JSON so logs are greppable/parseable without pulling in a
 * full logging platform. All metadata is passed through `redact()` first, so
 * even if a caller accidentally includes a secret it is never written.
 */

type Level = 'info' | 'warn' | 'error';

// ---------------- redaction ----------------

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;
const MAX_ARRAY = 100;
const MAX_KEYS = 200;

/**
 * Sensitive key fragments (matched case-insensitively against the key with all
 * non-alphanumerics stripped). Substring matching intentionally over-redacts:
 * e.g. `apikey` also covers `x-api-key`, `token` covers `accessToken` /
 * `refreshToken`, `databaseurl` covers `database_url` / `DATABASE_URL`.
 */
const SENSITIVE_FRAGMENTS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
  'databaseurl',
  'connectionstring',
  'credential',
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';

  seen.add(value as object);
  try {
    if (Array.isArray(value)) {
      const out = value.slice(0, MAX_ARRAY).map((item) => redactValue(item, depth + 1, seen));
      if (value.length > MAX_ARRAY) out.push(`[+${value.length - MAX_ARRAY} more]`);
      return out;
    }
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).slice(0, MAX_KEYS)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactValue(source[key], depth + 1, seen);
    }
    return out;
  } finally {
    // Only guard against cycles along the current path, not repeated siblings.
    seen.delete(value as object);
  }
}

/**
 * Return a deep copy of `meta` with sensitive values replaced by `[REDACTED]`.
 * Never mutates the input. Handles nested objects/arrays, differently cased
 * keys, circular references, and bounds depth/breadth to keep log lines sane.
 */
export function redact(meta: Record<string, unknown>): Record<string, unknown> {
  return redactValue(meta, 0, new WeakSet()) as Record<string, unknown>;
}

// ---------------- emit ----------------

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  const safeMeta = meta ? redact(meta) : undefined;
  let line: string;
  try {
    line = JSON.stringify({ level, message, ...safeMeta, ts: new Date().toISOString() });
  } catch {
    line = JSON.stringify({ level, message, ts: new Date().toISOString(), meta: '[unserializable]' });
  }
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
};

// ---------------- Assistant observability event ----------------

/** Bounded error classification — see `src/utils/errorCategory.ts`. */
export type ErrorCategory =
  | 'authentication'
  | 'authorization'
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'expired'
  | 'already_consumed'
  | 'idempotency'
  | 'provider_timeout'
  | 'provider_rate_limit'
  | 'provider_unavailable'
  | 'provider_invalid_response'
  | 'policy_rejected'
  | 'tool_failure'
  | 'database'
  | 'network'
  | 'internal';

export type IdempotencyOutcome = 'new' | 'replay' | 'conflict' | 'expired';

/**
 * Canonical, allowlisted field set for Assistant lifecycle events. Deliberately
 * a closed interface (no index signature) so a caller cannot pass through
 * message text, draft payloads, tokens, or other sensitive content by
 * accident — only these operational fields compile.
 */
export interface AssistantLogEvent {
  readonly event: string;
  readonly requestId?: string;
  readonly operation?: string;
  readonly stage?: string;
  readonly outcome?: string;
  readonly durationMs?: number;
  readonly httpStatus?: number;
  readonly errorCategory?: ErrorCategory;
  readonly retryable?: boolean;
  readonly idempotentReplay?: boolean;
  readonly idempotencyOutcome?: IdempotencyOutcome;
  readonly provider?: string;
  readonly model?: string;
  readonly tool?: string;
  readonly environment?: string;
  readonly service?: string;
  readonly clarificationRequired?: boolean;
  readonly draftCreated?: boolean;
  readonly optionCount?: number;
  readonly chainedClarification?: boolean;
  readonly hasActiveClarification?: boolean;
  readonly hasPendingDraft?: boolean;
  readonly hasTerminalClarification?: boolean;
  readonly attempt?: number;
  readonly leaseRecovered?: boolean;
  /** Callback interaction taxonomy (Phase 26A) — bounded closed-enum labels only, never token/payload content. */
  readonly interactionType?: string;
  readonly terminalStatus?: string;
}

/**
 * Emit a canonical Assistant lifecycle event. Fields are passed through
 * `redact()` like any other log call (defense in depth), but the real
 * safety mechanism is the `AssistantLogEvent` type itself — it only accepts
 * bounded operational metadata, never free-form request/response content.
 */
export function logEvent(level: Level, fields: AssistantLogEvent): void {
  emit(level, fields.event, { ...fields });
}

/** Monotonic-enough millisecond timer for lifecycle-stage durations. */
export function startTimer(): () => number {
  const startedAt = Date.now();
  return () => Date.now() - startedAt;
}

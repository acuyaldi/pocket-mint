import 'dotenv/config';
import { assertValidTimeZone } from '../domain/reportingTime';
import { loadAssistantProviderConfig } from './assistant-provider';
import { loadTelegramConfig } from '../telegram/config';

/**
 * Centralized, typed configuration.
 *
 * All environment-variable parsing lives here so there is a single source of
 * truth (no duplicated `process.env` reads scattered across modules) and so
 * `dotenv` is loaded before anything reads the environment. Secrets are parsed
 * but NEVER logged.
 */

// ---------------- parsing helpers ----------------

function str(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  const v = str(value)?.toLowerCase();
  if (v === undefined) return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(str(value));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Express `trust proxy` setting. Defaults to `false` (do not trust any proxy).
 * Set TRUST_PROXY to the NUMBER of trusted reverse-proxy hops in front of the
 * app (e.g. `1` behind a single load balancer). Avoid `true`, which trusts an
 * arbitrary X-Forwarded-For chain and lets clients spoof their rate-limit key.
 */
function parseTrustProxy(value: string | undefined): boolean | number {
  const v = str(value)?.toLowerCase();
  if (v === undefined || v === 'false') return false;
  if (v === 'true') return true;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : false;
}

// ---------------- server ----------------

const nodeEnv = str(process.env.NODE_ENV) ?? 'development';

export const isProduction = nodeEnv === 'production';

export const serverConfig = {
  nodeEnv,
  port: Number(process.env.PORT) || 5001,
} as const;

// One application-wide reporting calendar until user-specific timezones exist.
export const reportingConfig = {
  timezone: assertValidTimeZone(str(process.env.REPORTING_TIMEZONE) ?? 'Asia/Jakarta'),
} as const;

// ---------------- auth ----------------
//
// Authentication is JWT-only. A verified Supabase access token
// (`Authorization: Bearer <token>`) is the SOLE way to prove identity — there is
// no shared API key and no self-asserted `x-user-id` path. Configure at least
// one JWT verification key source below or all authentication fails at runtime.

const supabaseUrl = str(process.env.SUPABASE_URL)?.replace(/\/+$/, '');
const jwtSecret = str(process.env.SUPABASE_JWT_SECRET);
const jwtAudience = str(process.env.SUPABASE_JWT_AUD) ?? 'authenticated';
const jwtIssuer = str(process.env.SUPABASE_JWT_ISSUER) ?? (supabaseUrl ? `${supabaseUrl}/auth/v1` : undefined);

export const authConfig = {
  jwt: {
    /** HS256 shared secret (Supabase Project Settings > API > JWT Secret). */
    secret: jwtSecret,
    /** Base URL used to derive the JWKS endpoint for asymmetric signing keys. */
    supabaseUrl,
    /** Expected `aud` claim; always verified. */
    audience: jwtAudience,
    /** Expected `iss` claim; verified only when configured/derivable. */
    issuer: jwtIssuer,
    /** True when at least one verification key source is configured. */
    configured: Boolean(jwtSecret || supabaseUrl),
  },
} as const;

// ---------------- database ----------------
//
// Runtime PostgreSQL connection. DATABASE_URL is the SOLE connection source and
// is NEVER logged (the logger redacts any `databaseurl`/`connectionstring` key).
// Pool sizing is PROCESS-LOCAL: total server-side connections equal
// (pool.max × running application instances), so keep that product under the
// database provider's connection limit when scaling horizontally.
export const databaseConfig = {
  /**
   * Runtime connection string. Prefer a pooler-compatible URL (e.g. Supabase
   * transaction pooler) in constrained/serverless environments; use a direct
   * URL for `prisma migrate` (see DIRECT_URL and the deployment runbook).
   */
  url: str(process.env.DATABASE_URL),
  pool: {
    /** Max connections held by THIS process's pool. Conservative default. */
    max: int(process.env.DB_POOL_MAX, 10),
    /** Idle connection lifetime before the pool closes it (ms). */
    idleTimeoutMs: int(process.env.DB_IDLE_TIMEOUT_MS, 10_000),
    /**
     * Max time to wait to acquire a connection before failing (ms). Bounds
     * startup/request hangs when the database is unreachable; `pg` defaults to
     * 0 (wait forever), which we deliberately override.
     */
    connectionTimeoutMs: int(process.env.DB_CONNECTION_TIMEOUT_MS, 10_000),
  },
} as const;

// ---------------- Assistant provider ----------------

export const assistantProviderConfig = loadAssistantProviderConfig(process.env);

// ---------------- Telegram channel ----------------

export const telegramConfig = loadTelegramConfig(process.env);

// ---------------- network / rate limiting ----------------

export const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);

/**
 * Rate-limiting configuration. NOTE: the default limiter store is in-memory and
 * therefore PER INSTANCE — limits are not shared across horizontally scaled
 * processes. Move to a shared store (e.g. Redis) when running more than one
 * instance.
 */
export const rateLimitConfig = {
  enabled: bool(process.env.RATE_LIMIT_ENABLED, true),
  windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60_000),
  /** Max requests per window for general API traffic. */
  max: int(process.env.RATE_LIMIT_MAX, 300),
  /** Stricter cap per window for mutating requests (POST/PUT/PATCH/DELETE). */
  mutationMax: int(process.env.RATE_LIMIT_MUTATION_MAX, 60),
} as const;

// ---------------- CORS ----------------

/** Split a comma-separated origin list; trim whitespace and trailing slashes. */
function parseOrigins(value: string | undefined): string[] {
  return (str(value) ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o.length > 0);
}

const configuredOrigins = parseOrigins(process.env.CORS_ALLOWED_ORIGINS);

/** Dev-only convenience origins. NEVER used when NODE_ENV=production. */
const devDefaultOrigins = ['http://localhost:3000', 'http://localhost:5173'];

export const corsConfig = {
  /** Exact origins allowed for browser requests. */
  allowedOrigins:
    configuredOrigins.length > 0
      ? configuredOrigins
      : isProduction
        ? []
        : devDefaultOrigins,
  /** True when falling back to dev defaults (no explicit allowlist configured). */
  usingDevDefault: configuredOrigins.length === 0 && !isProduction,
} as const;

// ---------------- startup validation ----------------

/**
 * Validate configuration at startup. Fatal problems throw in production so the
 * process fails fast; in development they are surfaced as warnings so local
 * work is not blocked. Never prints secret values.
 */
export function validateConfig(): void {
  const fatal: string[] = [];
  const warnings: string[] = [];

  // Authentication is JWT-only: with no verification key source, every request
  // fails 401 (verification can never silently disable itself into an open
  // door). Fatal in production; a warning in development so local work is not
  // blocked before secrets are wired up.
  if (!authConfig.jwt.configured) {
    const msg =
      'No JWT verification configured — set SUPABASE_JWT_SECRET or SUPABASE_URL. All authentication will fail until one is set.';
    (isProduction ? fatal : warnings).push(msg);
  }

  // Runtime database connection is required. Without it the Prisma adapter
  // cannot be constructed and every DB-backed request fails. Fatal in
  // production; a warning in development so local work is not blocked before
  // the connection string is wired up. The URL itself is never printed.
  if (!databaseConfig.url) {
    const msg =
      'DATABASE_URL is not set — the application cannot connect to PostgreSQL.';
    (isProduction ? fatal : warnings).push(msg);
  }

  // Production must define an explicit CORS allowlist (never wildcard).
  if (isProduction && corsConfig.allowedOrigins.length === 0) {
    fatal.push('CORS_ALLOWED_ORIGINS must list at least one origin in production.');
  }
  if (corsConfig.usingDevDefault) {
    warnings.push(
      `CORS_ALLOWED_ORIGINS not set — using development defaults (${corsConfig.allowedOrigins.join(', ')}).`
    );
  }

  for (const w of warnings) console.warn(`⚠️  config: ${w}`);

  if (fatal.length > 0) {
    const message =
      'Invalid configuration:\n' + fatal.map((e) => `  - ${e}`).join('\n');
    if (isProduction) throw new Error(message);
    console.warn(`⚠️  ${message}`);
  }
}

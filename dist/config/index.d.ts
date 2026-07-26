import 'dotenv/config';
export declare const isProduction: boolean;
export declare const serverConfig: {
    readonly nodeEnv: string;
    readonly port: number;
};
export declare const reportingConfig: {
    readonly timezone: string;
};
export declare const authConfig: {
    readonly jwt: {
        /** HS256 shared secret (Supabase Project Settings > API > JWT Secret). */
        readonly secret: string | undefined;
        /** Base URL used to derive the JWKS endpoint for asymmetric signing keys. */
        readonly supabaseUrl: string | undefined;
        /** Expected `aud` claim; always verified. */
        readonly audience: string;
        /** Expected `iss` claim; verified only when configured/derivable. */
        readonly issuer: string | undefined;
        /** True when at least one verification key source is configured. */
        readonly configured: boolean;
    };
};
export declare const databaseConfig: {
    /**
     * Runtime connection string. Prefer a pooler-compatible URL (e.g. Supabase
     * transaction pooler) in constrained/serverless environments; use a direct
     * URL for `prisma migrate` (see DIRECT_URL and the deployment runbook).
     */
    readonly url: string | undefined;
    readonly pool: {
        /** Max connections held by THIS process's pool. Conservative default. */
        readonly max: number;
        /** Idle connection lifetime before the pool closes it (ms). */
        readonly idleTimeoutMs: number;
        /**
         * Max time to wait to acquire a connection before failing (ms). Bounds
         * startup/request hangs when the database is unreachable; `pg` defaults to
         * 0 (wait forever), which we deliberately override.
         */
        readonly connectionTimeoutMs: number;
    };
};
export declare const assistantProviderConfig: import("./assistant-provider").AssistantProviderConfig;
export declare const telegramConfig: import("../telegram/config").TelegramConfig;
export declare const trustProxy: number | boolean;
/**
 * Rate-limiting configuration. NOTE: the default limiter store is in-memory and
 * therefore PER INSTANCE — limits are not shared across horizontally scaled
 * processes. Move to a shared store (e.g. Redis) when running more than one
 * instance.
 */
export declare const rateLimitConfig: {
    readonly enabled: boolean;
    readonly windowMs: number;
    /** Max requests per window for general API traffic. */
    readonly max: number;
    /** Stricter cap per window for mutating requests (POST/PUT/PATCH/DELETE). */
    readonly mutationMax: number;
};
export declare const corsConfig: {
    /** Exact origins allowed for browser requests. */
    readonly allowedOrigins: string[];
    /** True when falling back to dev defaults (no explicit allowlist configured). */
    readonly usingDevDefault: boolean;
};
/**
 * Validate configuration at startup. Fatal problems throw in production so the
 * process fails fast; in development they are surfaced as warnings so local
 * work is not blocked. Never prints secret values.
 */
export declare function validateConfig(): void;

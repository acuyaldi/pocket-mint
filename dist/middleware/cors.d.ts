import cors, { type CorsOptions } from 'cors';
/**
 * CORS policy: explicit allowlist, no wildcard.
 *
 * - Requests without an `Origin` header (server-to-server, curl, health checks,
 *   same-origin navigation) are allowed.
 * - Browser requests are allowed only when their exact origin is in the
 *   allowlist; unknown origins are rejected by omitting CORS headers (the
 *   browser then blocks the response) rather than throwing a 500.
 * - `credentials` is disabled because the API uses header auth, not cookies —
 *   so a wildcard/credentials conflict can never arise.
 */
export declare const corsOptions: CorsOptions;
export declare const corsMiddleware: (req: cors.CorsRequest, res: {
    statusCode?: number | undefined;
    setHeader(key: string, value: string): any;
    end(): any;
}, next: (err?: any) => any) => void;

import { Request, Response, NextFunction } from 'express';
/**
 * Gate for user-scoped routes: require a verified JWT AND an existing local
 * user row for the verified `sub`. Publishes `req.auth = { userId }`.
 *
 * Decision tree (the order is the contract):
 *   1. No `Authorization: Bearer <token>` → 401 (`missing_bearer`).
 *   2. Token present but invalid/expired/wrong-aud/iss/signature → 401
 *      (`invalid_token`). Never falls back to any other identity source.
 *   3. Verified `sub` has no local user row → 401 (`unknown_user`).
 *   4. Otherwise publish the canonical `req.auth` context and continue.
 *
 * SECURITY: this NEVER falls back to a shared/default user and never reads
 * `x-user-id`, a body/query `userId`, or an API key.
 */
export declare function requireUser(req: Request, res: Response, next: NextFunction): Promise<void>;
/**
 * Gate for the identity-bootstrap route (`POST /users/sync`): require a verified
 * JWT but do NOT require a pre-existing local user row — this is the endpoint
 * that CREATES that row. Publishes `req.auth = { userId: <verified sub>, email }`
 * so the controller can provision/return exactly the caller's own local user.
 *
 * A verified user can therefore only ever sync themselves; the verified `sub` is
 * the authority and any `supabaseId` in the body is ignored downstream.
 */
export declare function requireVerifiedJwt(req: Request, res: Response, next: NextFunction): Promise<void>;

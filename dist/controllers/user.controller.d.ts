import { Request, Response, NextFunction } from "express";
export declare class UserController {
    /**
     * POST /api/v1/users/sync
     * Provision (or return) the local `users` row for the AUTHENTICATED caller.
     *
     * Identity is the verified JWT `sub` (published as `req.auth.userId` by
     * `requireVerifiedJwt`) — it is the sole authority for the local row's `id`.
     * A `supabaseId` in the body is ignored, so a caller can only ever sync
     * THEMSELVES. Email prefers the verified `email` claim, falling back to the
     * body only when the token carries none. Idempotent: a known user is a no-op
     * (200); an unknown one is created (201). `password` and any other unexpected
     * field are ignored — credentials are owned by Supabase Auth, never stored.
     */
    static sync(req: Request, res: Response, next: NextFunction): Promise<void>;
}

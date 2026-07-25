/** A successfully verified identity: the `sub` claim plus, when present, `email`. */
export interface VerifiedIdentity {
    sub: string;
    email?: string;
}
/** True when at least one verification key source is configured. */
export declare const jwtVerificationConfigured: boolean;
/**
 * Verify a Supabase access token and return the authenticated identity: the
 * `sub` claim (which equals the backend `User.id`) plus the verified `email`
 * claim when present. Returns null for any invalid, expired,
 * wrong-audience/issuer, or unverifiable token — never throws.
 */
export declare function verifySupabaseJwt(token: string): Promise<VerifiedIdentity | null>;

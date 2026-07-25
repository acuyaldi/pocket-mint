export type EntityResolutionErrorCode = 'ENTITY_RESOLUTION_CANDIDATE_LIMIT_EXCEEDED' | 'ENTITY_RESOLUTION_CONFIGURATION_ERROR' | 'ENTITY_RESOLUTION_FAILED';
export declare class EntityResolutionError extends Error {
    readonly statusCode: number;
    readonly code: EntityResolutionErrorCode;
    readonly isOperational = true;
    private constructor();
    static candidateLimitExceeded(): EntityResolutionError;
    static configuration(): EntityResolutionError;
    static failed(): EntityResolutionError;
}

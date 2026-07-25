export declare class InstallmentError extends Error {
    readonly statusCode: number;
    readonly code: string;
    /** Marks this as a known, client-safe error (as opposed to an unexpected 5xx). */
    readonly isOperational = true;
    constructor(message: string, statusCode: number, code: string);
}

export declare class RecurringTransactionError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly isOperational = true;
    constructor(message: string, statusCode: number, code: string);
}

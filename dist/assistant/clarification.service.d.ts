import { Prisma, type PrismaClient } from '../generated/prisma/client';
import type { AssistantStateProjection, CancelClarificationInput, ClarificationAdvanceResult, ClarificationCreationProjection, CreateClarificationInput, SelectClarificationInput, SelectClarificationResult } from './clarification.types';
export declare const CLARIFICATION_TTL_MS: number;
export type TransactionClient = Prisma.TransactionClient;
export interface TransactionOption {
    readonly transaction?: TransactionClient;
}
declare function digestToken(token: string): string;
declare function generateToken(): string;
export declare function createClarificationService(db: PrismaClient): {
    create: (input: CreateClarificationInput, options?: TransactionOption) => Promise<ClarificationCreationProjection>;
    select: (input: SelectClarificationInput, options?: TransactionOption) => Promise<SelectClarificationResult>;
    cancel: (input: CancelClarificationInput, options?: TransactionOption) => Promise<void>;
    getAssistantState: (userId: string, conversationId: string) => Promise<AssistantStateProjection>;
    buildConsumedResult: (consumedClarificationId: string) => Pick<ClarificationAdvanceResult, "consumedClarificationId">;
    runInTransaction: <T>(work: (tx: TransactionClient) => Promise<T>, existing?: TransactionClient) => Promise<T>;
    _digestToken: typeof digestToken;
    _generateToken: typeof generateToken;
};
export type ClarificationService = ReturnType<typeof createClarificationService>;
export {};

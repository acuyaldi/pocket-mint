import { type PrismaClient } from '../generated/prisma/client';
import type { AssistantStateProjection, CancelClarificationInput, ClarificationAdvanceResult, ClarificationCreationProjection, CreateClarificationInput, SelectClarificationInput, SelectClarificationResult } from './clarification.types';
declare function digestToken(token: string): string;
declare function generateToken(): string;
export declare function createClarificationService(db: PrismaClient): {
    create: (input: CreateClarificationInput) => Promise<ClarificationCreationProjection>;
    select: (input: SelectClarificationInput) => Promise<SelectClarificationResult>;
    cancel: (input: CancelClarificationInput) => Promise<void>;
    getAssistantState: (userId: string, conversationId: string) => Promise<AssistantStateProjection>;
    buildConsumedResult: (consumedClarificationId: string) => Pick<ClarificationAdvanceResult, "consumedClarificationId">;
    _digestToken: typeof digestToken;
    _generateToken: typeof generateToken;
};
export type ClarificationService = ReturnType<typeof createClarificationService>;
export {};

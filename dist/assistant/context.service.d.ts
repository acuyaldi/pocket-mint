import { type PrismaClient } from '../generated/prisma/client';
import type { AssistantContext, AssistantContextLimits } from './context.types';
export interface BuildAssistantExecutionContextInput {
    readonly userId: string;
    readonly conversationId: string;
    /** Unpersisted request for the in-progress provider turn; appended exactly once. */
    readonly currentRequest: string;
}
export declare function createAssistantContextService(db: PrismaClient, clock?: () => Date, limits?: AssistantContextLimits): {
    buildExecutionContext: (input: BuildAssistantExecutionContextInput) => Promise<AssistantContext>;
};
export type AssistantContextService = ReturnType<typeof createAssistantContextService>;

import type { AssistantContext, AssistantContextAssemblyInput, AssistantContextLimits } from './context.types';
export declare const DEFAULT_ASSISTANT_CONTEXT_LIMITS: Readonly<AssistantContextLimits>;
export declare function validateAssistantContextLimits(limits: AssistantContextLimits): void;
export declare function assembleAssistantContext(input: AssistantContextAssemblyInput, limits?: AssistantContextLimits): AssistantContext;

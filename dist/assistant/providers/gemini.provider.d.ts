import { type AssistantModelProvider } from '../provider-types';
interface GeminiResponseLike {
    readonly text?: string;
    readonly candidates?: readonly {
        readonly finishReason?: string;
    }[];
    readonly promptFeedback?: {
        readonly blockReason?: string;
    };
    readonly usageMetadata?: {
        readonly promptTokenCount?: number;
        readonly candidatesTokenCount?: number;
        readonly totalTokenCount?: number;
        readonly cachedContentTokenCount?: number;
    };
}
interface GeminiClientLike {
    readonly models: {
        generateContent(input: unknown): Promise<GeminiResponseLike>;
    };
}
export interface GeminiAssistantProviderConfig {
    readonly apiKey: string;
    readonly model: string;
    readonly timeoutMs: number;
    readonly maxResponseBytes: number;
}
export declare function createGeminiAssistantProvider(config: GeminiAssistantProviderConfig, injectedClient?: GeminiClientLike): AssistantModelProvider;
export {};

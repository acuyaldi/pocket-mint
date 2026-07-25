export interface AssistantProviderConfig {
    readonly enabled: boolean;
    readonly provider: 'gemini' | null;
    readonly model: string | null;
    readonly apiKey: string | null;
    readonly timeoutMs: number;
    readonly maxResponseBytes: number;
    readonly maxPlanDepth: number;
    readonly publicMetadata: {
        readonly enabled: boolean;
        readonly provider: 'gemini' | null;
        readonly model: string | null;
        readonly timeoutMs: number;
    };
}
type Environment = Readonly<Record<string, string | undefined>>;
export declare function loadAssistantProviderConfig(env: Environment): AssistantProviderConfig;
export {};

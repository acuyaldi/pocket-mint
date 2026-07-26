export interface ChannelWorkerConfig {
    readonly workersEnabled: boolean;
    readonly inboundPollMs: number;
    readonly outboundPollMs: number;
    readonly batchSize: number;
    readonly leaseMs: number;
    readonly maxAttemptsInbound: number;
    readonly maxAttemptsOutbound: number;
    readonly retentionDays: number;
}
type Environment = Readonly<Record<string, string | undefined>>;
/**
 * Mirrors the hand-rolled parsing pattern in src/config/index.ts (no Zod in
 * this repo). Workers default ON in dev/prod but are always forced off under
 * NODE_ENV=test so the test suite never starts a background poll loop.
 */
export declare function loadChannelWorkerConfig(env: Environment): ChannelWorkerConfig;
export {};

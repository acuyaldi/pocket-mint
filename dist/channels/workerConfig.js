"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadChannelWorkerConfig = loadChannelWorkerConfig;
function bool(value, fallback) {
    const v = value?.trim().toLowerCase();
    if (!v)
        return fallback;
    return v === 'true' || v === '1' || v === 'yes';
}
function int(value, fallback) {
    const n = Number(value?.trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
/**
 * Mirrors the hand-rolled parsing pattern in src/config/index.ts (no Zod in
 * this repo). Workers default ON in dev/prod but are always forced off under
 * NODE_ENV=test so the test suite never starts a background poll loop.
 */
function loadChannelWorkerConfig(env) {
    const isTest = env.NODE_ENV === 'test';
    return {
        workersEnabled: isTest ? false : bool(env.CHANNEL_WORKERS_ENABLED, true),
        inboundPollMs: int(env.CHANNEL_INBOUND_POLL_MS, 2000),
        outboundPollMs: int(env.CHANNEL_OUTBOUND_POLL_MS, 2000),
        batchSize: int(env.CHANNEL_BATCH_SIZE, 10),
        leaseMs: int(env.CHANNEL_LEASE_MS, 30000),
        maxAttemptsInbound: int(env.CHANNEL_MAX_ATTEMPTS_INBOUND, 5),
        maxAttemptsOutbound: int(env.CHANNEL_MAX_ATTEMPTS_OUTBOUND, 5),
        retentionDays: int(env.CHANNEL_RETENTION_DAYS, 7),
    };
}
//# sourceMappingURL=workerConfig.js.map
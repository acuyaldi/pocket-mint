"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// `./config` loads dotenv (side effect) and parses/validates env before any
// other module reads process.env, so it must be imported first.
const config_1 = require("./config");
const app_1 = __importDefault(require("./app"));
const prisma_1 = require("./lib/prisma");
const logger_1 = require("./utils/logger");
const bootstrap_1 = require("./channels/bootstrap");
const loop_1 = require("./channels/workers/loop");
(0, config_1.validateConfig)();
/** Starts the inbound/outbound channel worker loops if enabled; returns an abort function for graceful shutdown. */
function startChannelWorkers() {
    if (!config_1.channelWorkerConfig.workersEnabled || (!bootstrap_1.channelInboundWorker && !bootstrap_1.channelOutboundWorker)) {
        return async () => undefined;
    }
    const controller = new AbortController();
    const loops = [];
    if (bootstrap_1.channelInboundWorker) {
        (0, logger_1.logEvent)('info', { event: 'channel.worker.started', provider: 'telegram', operation: 'inbound' });
        loops.push((0, loop_1.runWorkerLoop)({
            signal: controller.signal,
            pollIntervalMs: config_1.channelWorkerConfig.inboundPollMs,
            poll: bootstrap_1.channelInboundWorker.pollOnce,
            onError: (error) => logger_1.logger.error('Inbound channel worker poll failed', { error: error.message }),
        }));
    }
    if (bootstrap_1.channelOutboundWorker) {
        (0, logger_1.logEvent)('info', { event: 'channel.worker.started', provider: 'telegram', operation: 'outbound' });
        loops.push((0, loop_1.runWorkerLoop)({
            signal: controller.signal,
            pollIntervalMs: config_1.channelWorkerConfig.outboundPollMs,
            poll: bootstrap_1.channelOutboundWorker.pollOnce,
            onError: (error) => logger_1.logger.error('Outbound channel worker poll failed', { error: error.message }),
        }));
    }
    return async () => {
        controller.abort();
        await Promise.all(loops);
        (0, logger_1.logEvent)('info', { event: 'channel.worker.stopped', provider: 'telegram' });
    };
}
async function start() {
    // Fail fast if the database is unreachable at boot. This surfaces bad
    // credentials / networking immediately instead of on the first request. The
    // connection string is never logged — only a safe error summary.
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
    }
    catch (err) {
        logger_1.logger.error('Database connection failed at startup', {
            error: err.message,
        });
        await (0, prisma_1.closePrisma)();
        process.exit(1);
    }
    const server = app_1.default.listen(config_1.serverConfig.port, () => {
        console.log(`🚀 Server running on http://localhost:${config_1.serverConfig.port}`);
        console.log(`📦 Environment: ${config_1.serverConfig.nodeEnv}`);
    });
    const stopChannelWorkers = startChannelWorkers();
    // Graceful shutdown: stop accepting new connections, stop the channel
    // worker loops, then release DB resources. Guarded so a second signal
    // can't double-clean.
    let shuttingDown = false;
    const shutdown = (signal) => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        logger_1.logger.info('Shutting down', { signal });
        server.close((err) => {
            if (err)
                logger_1.logger.error('HTTP server close failed', { error: err.message });
            stopChannelWorkers()
                .catch((workerErr) => logger_1.logger.error('Channel worker shutdown failed', { error: workerErr.message }))
                .then(() => (0, prisma_1.closePrisma)())
                .catch((closeErr) => logger_1.logger.error('Database cleanup failed', {
                error: closeErr.message,
            }))
                .finally(() => process.exit(err ? 1 : 0));
        });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
void start();
//# sourceMappingURL=server.js.map
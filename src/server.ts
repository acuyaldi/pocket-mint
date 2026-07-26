// `./config` loads dotenv (side effect) and parses/validates env before any
// other module reads process.env, so it must be imported first.
import { serverConfig, validateConfig, channelWorkerConfig } from './config';
import app from './app';
import { prisma, closePrisma } from './lib/prisma';
import { logger, logEvent } from './utils/logger';
import { channelInboundWorker, channelOutboundWorker } from './channels/bootstrap';
import { runWorkerLoop } from './channels/workers/loop';

validateConfig();

/** Starts the inbound/outbound channel worker loops if enabled; returns an abort function for graceful shutdown. */
function startChannelWorkers(): () => Promise<void> {
  if (!channelWorkerConfig.workersEnabled || (!channelInboundWorker && !channelOutboundWorker)) {
    return async () => undefined;
  }
  const controller = new AbortController();
  const loops: Promise<void>[] = [];

  if (channelInboundWorker) {
    logEvent('info', { event: 'channel.worker.started', provider: 'telegram', operation: 'inbound' });
    loops.push(runWorkerLoop({
      signal: controller.signal,
      pollIntervalMs: channelWorkerConfig.inboundPollMs,
      poll: channelInboundWorker.pollOnce,
      onError: (error) => logger.error('Inbound channel worker poll failed', { error: (error as Error).message }),
    }));
  }
  if (channelOutboundWorker) {
    logEvent('info', { event: 'channel.worker.started', provider: 'telegram', operation: 'outbound' });
    loops.push(runWorkerLoop({
      signal: controller.signal,
      pollIntervalMs: channelWorkerConfig.outboundPollMs,
      poll: channelOutboundWorker.pollOnce,
      onError: (error) => logger.error('Outbound channel worker poll failed', { error: (error as Error).message }),
    }));
  }

  return async () => {
    controller.abort();
    await Promise.all(loops);
    logEvent('info', { event: 'channel.worker.stopped', provider: 'telegram' });
  };
}

async function start(): Promise<void> {
  // Fail fast if the database is unreachable at boot. This surfaces bad
  // credentials / networking immediately instead of on the first request. The
  // connection string is never logged — only a safe error summary.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    logger.error('Database connection failed at startup', {
      error: (err as Error).message,
    });
    await closePrisma();
    process.exit(1);
  }

  const server = app.listen(serverConfig.port, () => {
    console.log(`🚀 Server running on http://localhost:${serverConfig.port}`);
    console.log(`📦 Environment: ${serverConfig.nodeEnv}`);
  });

  const stopChannelWorkers = startChannelWorkers();

  // Graceful shutdown: stop accepting new connections, stop the channel
  // worker loops, then release DB resources. Guarded so a second signal
  // can't double-clean.
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down', { signal });

    server.close((err) => {
      if (err) logger.error('HTTP server close failed', { error: err.message });
      stopChannelWorkers()
        .catch((workerErr) => logger.error('Channel worker shutdown failed', { error: (workerErr as Error).message }))
        .then(() => closePrisma())
        .catch((closeErr) =>
          logger.error('Database cleanup failed', {
            error: (closeErr as Error).message,
          }),
        )
        .finally(() => process.exit(err ? 1 : 0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void start();

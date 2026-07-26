"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processDelivery = processDelivery;
exports.createOutboundWorker = createOutboundWorker;
const logger_1 = require("../../utils/logger");
const claim_1 = require("./claim");
const retry_1 = require("./retry");
const retention_1 = require("../retention");
/** Telegram's own 429 retry_after (client.ts already honors it inline once); this is the outer, durable retry schedule. */
const OUTER_BACKOFF = { baseMs: 2000, maxMs: 5 * 60000 };
/** Exported for direct unit testing — pollOnce composes this with the raw-SQL claim step. */
async function processDelivery(deps, delivery) {
    const outcome = await deps.client.sendMessage(delivery.destinationChatId, delivery.renderedText);
    if (outcome.ok) {
        await deps.db.channelOutboundDelivery.update({
            where: { id: delivery.id },
            data: { status: 'SENT', sentAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
        });
        (0, logger_1.logEvent)('info', { event: 'channel.outbound.sent', requestId: delivery.id, provider: 'telegram', attempt: delivery.attempt });
        return;
    }
    const decision = (0, retry_1.decideRetry)(outcome.category, delivery.attempt, deps.config.maxAttemptsOutbound, OUTER_BACKOFF);
    await deps.db.channelOutboundDelivery.update({
        where: { id: delivery.id },
        data: decision.outcome === 'retry'
            ? { status: 'FAILED_RETRYABLE', availableAt: decision.availableAt, leaseOwner: null, leaseExpiresAt: null, errorCategory: outcome.category }
            : { status: 'FAILED_TERMINAL', leaseOwner: null, leaseExpiresAt: null, errorCategory: outcome.category },
    });
    (0, logger_1.logEvent)(decision.outcome === 'retry' ? 'info' : 'warn', {
        event: decision.outcome === 'retry' ? 'channel.outbound.retry_scheduled' : 'channel.outbound.failed',
        requestId: delivery.id,
        provider: 'telegram',
        attempt: delivery.attempt,
        errorCategory: outcome.category,
        retryable: decision.outcome === 'retry',
    });
}
function createOutboundWorker(deps) {
    async function pollOnce() {
        const deliveries = await (0, claim_1.claimOutboundDeliveries)(deps.db, {
            batchSize: deps.config.batchSize,
            leaseMs: deps.config.leaseMs,
            owner: deps.owner,
        });
        for (const delivery of deliveries) {
            if (delivery.attempt > 1) {
                (0, logger_1.logEvent)('info', { event: 'channel.outbound.claimed', requestId: delivery.id, provider: 'telegram', attempt: delivery.attempt, leaseRecovered: true });
            }
            await processDelivery(deps, delivery);
        }
        if (deliveries.length > 0) {
            await (0, retention_1.cleanupChannelRecords)(deps.db, deps.config.retentionDays).catch(() => undefined);
        }
        return deliveries.length;
    }
    return { pollOnce };
}
//# sourceMappingURL=outbound.worker.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTelegramService = createTelegramService;
const envelope_1 = require("./envelope");
const inboundJob_service_1 = require("../channels/inboundJob.service");
const logger_1 = require("../utils/logger");
/**
 * Webhook-facing entry point. Performs ONLY bounded transport work: parse,
 * classify, resolve identity (read-only), and durably persist the update as a
 * ChannelInboundJob before returning — see docs/product/decisions/015. Never
 * invokes the Assistant or Telegram delivery; that happens in the inbound/
 * outbound workers (src/channels/workers/), independently of webhook latency.
 */
function createTelegramService(deps) {
    async function handleUpdate(rawUpdate, correlationId) {
        const envelope = (0, envelope_1.normalizeTelegramUpdate)(rawUpdate);
        if (!envelope) {
            (0, logger_1.logEvent)('info', { event: 'channel.webhook.received', requestId: correlationId, provider: 'telegram', outcome: 'unsupported' });
            return;
        }
        const connection = await deps.connections.getActiveConnection('TELEGRAM', envelope.externalSenderId);
        const isNew = await (0, inboundJob_service_1.createInboundJob)(deps.db, connection?.id ?? null, envelope);
        if (!isNew) {
            (0, logger_1.logEvent)('info', { event: 'channel.inbound.duplicate', requestId: correlationId, provider: 'telegram' });
            return;
        }
        (0, logger_1.logEvent)('info', { event: 'channel.webhook.received', requestId: correlationId, provider: 'telegram', outcome: 'accepted' });
        (0, logger_1.logEvent)('info', { event: 'channel.inbound.accepted', requestId: correlationId, provider: 'telegram' });
    }
    return { handleUpdate };
}
//# sourceMappingURL=telegram.service.js.map
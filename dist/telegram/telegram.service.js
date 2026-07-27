"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTelegramService = createTelegramService;
const envelope_1 = require("./envelope");
const inboundJob_service_1 = require("../channels/inboundJob.service");
const logger_1 = require("../utils/logger");
/**
 * Webhook-facing entry point. Performs ONLY bounded transport work: parse,
 * classify, resolve identity (read-only), durably persist the update as a
 * ChannelInboundJob, and — for a callback query — synchronously acknowledge
 * it. Never invokes the Assistant, never resolves clarification/draft
 * ownership, never edits the Telegram message, never waits on the durable
 * worker; that happens in the inbound/outbound workers (src/channels/workers/)
 * independently of webhook latency. See docs/product/decisions/015.
 *
 * A failure to acknowledge the callback (network hiccup, Telegram error) must
 * not undo durable inbound acceptance — the job was already committed above,
 * so `answerCallbackQuery` failure here is swallowed and only logged; the
 * durable worker still processes the job normally (Telegram may show the
 * user a spinner timeout, but retrying the same update is deduplicated and
 * the underlying action still executes at most once).
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
        if (envelope.kind === 'CALLBACK' && envelope.callbackQueryId) {
            const acknowledged = await deps.client.answerCallbackQuery(envelope.callbackQueryId).catch(() => ({ ok: false, category: 'provider_unavailable' }));
            (0, logger_1.logEvent)(acknowledged.ok ? 'info' : 'warn', {
                event: 'channel.telegram.callback_acknowledged',
                requestId: correlationId,
                provider: 'telegram',
                outcome: acknowledged.ok ? 'accepted' : 'failed',
                ...(acknowledged.ok ? {} : { errorCategory: acknowledged.category }),
            });
        }
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
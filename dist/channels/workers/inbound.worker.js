"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processJob = processJob;
exports.createInboundWorker = createInboundWorker;
const commands_1 = require("../../telegram/commands");
const commandHandler_1 = require("../../telegram/commandHandler");
const replyRenderer_1 = require("../../telegram/replyRenderer");
const keyboardRenderer_1 = require("../../telegram/keyboardRenderer");
const errorCategory_1 = require("../../utils/errorCategory");
const logger_1 = require("../../utils/logger");
const claim_1 = require("./claim");
const assistantOperationGuard_1 = require("./assistantOperationGuard");
const retry_1 = require("./retry");
const retention_1 = require("../retention");
const interaction_service_1 = require("../interaction.service");
const callbackToken_service_1 = require("../callbackToken.service");
const PROVIDER_UNAVAILABLE_MESSAGE = 'The Assistant is not available right now. Please try again later.';
async function markSucceeded(db, jobId) {
    await db.channelInboundJob.update({
        where: { id: jobId },
        data: { status: 'SUCCEEDED', completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
    });
}
async function markFailed(db, job, category, maxAttempts, backoff) {
    const decision = (0, retry_1.decideRetry)(category, job.attempt, maxAttempts, backoff);
    await db.channelInboundJob.update({
        where: { id: job.id },
        data: decision.outcome === 'retry'
            ? { status: 'FAILED_RETRYABLE', availableAt: decision.availableAt, leaseOwner: null, leaseExpiresAt: null, errorCategory: category }
            : { status: 'FAILED_TERMINAL', completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, errorCategory: category },
    });
    return decision.outcome;
}
/** Creates the single outbound delivery for a job, idempotent against a reclaim after the row already exists. */
async function ensureOutboundDelivery(db, job, text, replyMarkup) {
    try {
        await db.channelOutboundDelivery.create({
            data: {
                inboundJobId: job.id,
                provider: job.provider,
                kind: 'SEND_MESSAGE',
                destinationChatId: job.externalChatId,
                renderedText: (0, replyRenderer_1.truncateOutbound)(text),
                ...(replyMarkup ? { replyMarkup: replyMarkup } : {}),
            },
        });
    }
    catch (error) {
        if (error.code !== 'P2002')
            throw error;
        // Delivery already created by a previous attempt on this job — reclaim-safe no-op.
    }
}
/** Idempotent, mirrors ensureOutboundDelivery — targets the message the pressed inline keyboard is attached to. */
async function ensureKeyboardCleanupDelivery(db, job) {
    if (!job.callbackMessageId)
        return;
    try {
        await db.channelOutboundDelivery.create({
            data: {
                inboundJobId: job.id,
                provider: job.provider,
                kind: 'EDIT_REPLY_MARKUP',
                destinationChatId: job.externalChatId,
                renderedText: '',
                targetMessageId: job.callbackMessageId,
            },
        });
    }
    catch (error) {
        if (error.code !== 'P2002')
            throw error;
    }
}
/**
 * Callback jobs never reach the Assistant NL path (parseTelegramCommand /
 * assistantProviderRuntime.sendMessage) — they route straight to the
 * interaction service, which re-derives ownership and calls the same
 * clarification/draft application services the web path uses.
 */
async function processCallbackJob(deps, job, correlationId) {
    const backoff = { baseMs: 1000, maxMs: 60000 };
    try {
        if (!deps.assistantProviderRuntime) {
            await ensureOutboundDelivery(deps.db, job, PROVIDER_UNAVAILABLE_MESSAGE);
            await markSucceeded(deps.db, job.id);
            return;
        }
        const found = await (0, callbackToken_service_1.findCallbackTokenByRaw)(deps.db, job.text);
        const operationUserId = found ? (await deps.db.channelConnection.findUnique({ where: { id: found.connectionId } }))?.userId ?? job.externalSenderId : job.externalSenderId;
        const operationId = (0, assistantOperationGuard_1.channelOperationId)(job.provider, job.id);
        const guard = await (0, assistantOperationGuard_1.beginCallbackOperation)(deps.db, operationId, operationUserId, found?.id ?? null);
        if (guard.status === 'ambiguous') {
            await deps.db.channelInboundJob.update({
                where: { id: job.id },
                data: { status: 'FAILED_TERMINAL', completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, errorCategory: 'ambiguous_callback_execution' },
            });
            (0, logger_1.logEvent)('warn', { event: 'channel.inbound.failed', requestId: correlationId, provider: 'telegram', errorCategory: 'internal', retryable: false });
            return;
        }
        let terminalStatus;
        let replyText;
        let keyboard;
        let clearOriginalKeyboard = false;
        if (guard.status === 'replay') {
            // A prior attempt already executed the callback action and recorded the
            // terminal result — reuse it verbatim, never repeat the action for this job.
            terminalStatus = guard.terminalStatus;
            replyText = guard.renderedText;
        }
        else {
            const elapsed = (0, logger_1.startTimer)();
            const result = await (0, interaction_service_1.processCallback)({ db: deps.db, providerRuntime: deps.assistantProviderRuntime }, job, correlationId);
            terminalStatus = result.terminalStatus;
            replyText = result.replyText;
            clearOriginalKeyboard = result.clearOriginalKeyboard;
            if (result.keyboard)
                keyboard = (0, keyboardRenderer_1.renderInlineKeyboard)(result.keyboard);
            await (0, assistantOperationGuard_1.completeCallbackOperation)(deps.db, operationId, terminalStatus, replyText);
            (0, logger_1.logEvent)('info', {
                event: 'channel.callback.completed',
                requestId: correlationId,
                provider: 'telegram',
                durationMs: elapsed(),
                terminalStatus,
            });
        }
        await ensureOutboundDelivery(deps.db, job, replyText, keyboard);
        if (clearOriginalKeyboard) {
            await ensureKeyboardCleanupDelivery(deps.db, job);
            (0, logger_1.logEvent)('info', { event: 'channel.telegram.keyboard_cleanup_scheduled', requestId: correlationId, provider: 'telegram' });
        }
        await markSucceeded(deps.db, job.id);
        (0, logger_1.logEvent)('info', { event: 'channel.inbound.completed', requestId: correlationId, provider: 'telegram', attempt: job.attempt });
    }
    catch (error) {
        const category = (0, errorCategory_1.categorizeError)(error);
        (0, logger_1.logEvent)('warn', { event: 'channel.callback.rejected', requestId: correlationId, provider: 'telegram', errorCategory: category });
        const outcome = await markFailed(deps.db, job, category, deps.config.maxAttemptsInbound, backoff);
        (0, logger_1.logEvent)(outcome === 'retry' ? 'info' : 'warn', {
            event: outcome === 'retry' ? 'channel.inbound.retry_scheduled' : 'channel.inbound.failed',
            requestId: correlationId,
            provider: 'telegram',
            attempt: job.attempt,
            errorCategory: category,
            retryable: outcome === 'retry',
        });
    }
}
/** Exported for direct unit testing — pollOnce composes this with the raw-SQL claim step. */
async function processJob(deps, job, correlationId) {
    if (job.kind === 'CALLBACK')
        return processCallbackJob(deps, job, correlationId);
    const backoff = { baseMs: 1000, maxMs: 60000 };
    try {
        const command = (0, commands_1.parseTelegramCommand)(job.text);
        if (command) {
            const reply = await (0, commandHandler_1.handleTelegramCommand)({ linkTokens: deps.linkTokens, connections: deps.connections }, command, job.externalSenderId, job.externalChatId);
            await ensureOutboundDelivery(deps.db, job, reply);
            await markSucceeded(deps.db, job.id);
            (0, logger_1.logEvent)('info', { event: 'channel.inbound.completed', requestId: correlationId, provider: 'telegram', attempt: job.attempt });
            return;
        }
        const activeConnection = await deps.connections.getActiveConnection('TELEGRAM', job.externalSenderId);
        if (!activeConnection) {
            const reply = 'Your Telegram account is not linked yet. Open Pocket Mint on the web, generate a linking code, then send /link <code> here.';
            await ensureOutboundDelivery(deps.db, job, reply);
            await markSucceeded(deps.db, job.id);
            return;
        }
        if (!deps.assistantProviderRuntime) {
            await ensureOutboundDelivery(deps.db, job, PROVIDER_UNAVAILABLE_MESSAGE);
            await markSucceeded(deps.db, job.id);
            return;
        }
        const operationId = (0, assistantOperationGuard_1.channelOperationId)(job.provider, job.id);
        const guard = await (0, assistantOperationGuard_1.beginAssistantOperation)(deps.db, operationId, activeConnection.userId);
        if (guard.status === 'ambiguous') {
            await deps.db.channelInboundJob.update({
                where: { id: job.id },
                data: { status: 'FAILED_TERMINAL', completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, errorCategory: 'ambiguous_assistant_execution' },
            });
            (0, logger_1.logEvent)('warn', { event: 'channel.inbound.failed', requestId: correlationId, provider: 'telegram', errorCategory: 'internal', retryable: false });
            return;
        }
        let turnId;
        let replyText;
        let keyboard;
        if (guard.status === 'replay') {
            // A prior attempt on this job already completed the Assistant call and
            // recorded the rendered reply — reuse it verbatim, never call the
            // Assistant again for this job (crash-window C). No keyboard is
            // rebuilt on replay: buttons are rendered once, at first success, same
            // as the callback path.
            turnId = guard.turnId;
            replyText = guard.renderedText;
        }
        else {
            const elapsed = (0, logger_1.startTimer)();
            (0, logger_1.logEvent)('info', { event: 'channel.assistant.started', requestId: correlationId, provider: 'telegram' });
            const result = await deps.assistantProviderRuntime.sendMessage(activeConnection.userId, correlationId, {
                message: job.text,
                ...(activeConnection.conversationId ? { conversationId: activeConnection.conversationId } : {}),
            });
            (0, logger_1.logEvent)('info', {
                event: 'channel.assistant.completed',
                requestId: correlationId,
                provider: 'telegram',
                durationMs: elapsed(),
                outcome: result.response.status,
            });
            const responseConversationId = result.response.conversationId;
            if (responseConversationId && responseConversationId !== activeConnection.conversationId) {
                await deps.connections.setCurrentConversation(activeConnection.id, responseConversationId);
            }
            turnId = result.response.turnId;
            // Only a clarification (with supported options) or a freshly created
            // draft gets rendered as an inline keyboard — everything else
            // (unsupported/rejected/plain analytics success) falls back to the
            // existing bounded text rendering, unchanged from Phase 25.
            const responseStatus = result.response.status;
            if (responseStatus === 'clarification_required' || responseStatus === 'success') {
                const rendered = await (0, interaction_service_1.renderApplicationResult)(deps.db, activeConnection.id, responseConversationId ?? activeConnection.conversationId ?? '', result);
                if (rendered.keyboard) {
                    replyText = rendered.replyText;
                    keyboard = (0, keyboardRenderer_1.renderInlineKeyboard)(rendered.keyboard);
                }
                else {
                    replyText = (0, replyRenderer_1.renderAssistantReply)(result.response);
                }
            }
            else {
                replyText = (0, replyRenderer_1.renderAssistantReply)(result.response);
            }
            await (0, assistantOperationGuard_1.completeAssistantOperation)(deps.db, operationId, turnId, replyText);
        }
        await deps.db.channelInboundJob.update({ where: { id: job.id }, data: { assistantTurnId: turnId } });
        await ensureOutboundDelivery(deps.db, job, replyText, keyboard);
        await markSucceeded(deps.db, job.id);
        (0, logger_1.logEvent)('info', { event: 'channel.inbound.completed', requestId: correlationId, provider: 'telegram', attempt: job.attempt });
    }
    catch (error) {
        const category = (0, errorCategory_1.categorizeError)(error);
        (0, logger_1.logEvent)('warn', { event: 'channel.assistant.failed', requestId: correlationId, provider: 'telegram', errorCategory: category });
        const outcome = await markFailed(deps.db, job, category, deps.config.maxAttemptsInbound, backoff);
        (0, logger_1.logEvent)(outcome === 'retry' ? 'info' : 'warn', {
            event: outcome === 'retry' ? 'channel.inbound.retry_scheduled' : 'channel.inbound.failed',
            requestId: correlationId,
            provider: 'telegram',
            attempt: job.attempt,
            errorCategory: category,
            retryable: outcome === 'retry',
        });
    }
}
function createInboundWorker(deps) {
    async function pollOnce() {
        const jobs = await (0, claim_1.claimInboundJobs)(deps.db, { batchSize: deps.config.batchSize, leaseMs: deps.config.leaseMs, owner: deps.owner });
        for (const job of jobs) {
            if (job.attempt > 1) {
                (0, logger_1.logEvent)('info', { event: 'channel.inbound.claimed', requestId: job.id, provider: 'telegram', attempt: job.attempt, leaseRecovered: true });
            }
            await processJob(deps, job, job.id);
        }
        if (jobs.length > 0) {
            await (0, retention_1.cleanupChannelRecords)(deps.db, deps.config.retentionDays).catch(() => undefined);
        }
        return jobs.length;
    }
    return { pollOnce };
}
//# sourceMappingURL=inbound.worker.js.map
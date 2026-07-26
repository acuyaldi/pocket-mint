"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTelegramService = createTelegramService;
const envelope_1 = require("./envelope");
const commands_1 = require("./commands");
const dedup_1 = require("./dedup");
const errors_1 = require("../channels/errors");
const logger_1 = require("../utils/logger");
const MAX_OUTBOUND_LENGTH = 4000;
const WEB_HANDOFF_MESSAGE = 'Please continue in the Pocket Mint web app to review and confirm this — Telegram cannot complete this step yet.';
const NOT_LINKED_MESSAGE = 'Your Telegram account is not linked yet. Open Pocket Mint on the web, generate a linking code, then send /link <code> here.';
const PROVIDER_UNAVAILABLE_MESSAGE = 'The Assistant is not available right now. Please try again later.';
const HELP_TEXT = [
    'Available commands:',
    '/link <code> — link this Telegram account to your Pocket Mint account',
    '/status — show your linking status',
    '/new — start a new conversation',
    '/unlink — disconnect this Telegram account',
    '/help — show this message',
].join('\n');
/** Bounded boolean signal only — mirrors assistant.controller.ts's draftWasCreated. */
function draftWasCreated(response) {
    if (typeof response !== 'object' || response === null)
        return false;
    const value = response;
    return value.status === 'success' && value.data?.confirmationRequired === true;
}
function createTelegramService(deps) {
    async function handleCommand(command, externalSenderId, externalChatId) {
        switch (command.name) {
            case 'start':
                return `Welcome to Pocket Mint. ${NOT_LINKED_MESSAGE}\n\n${HELP_TEXT}`;
            case 'help':
                return HELP_TEXT;
            case 'link': {
                try {
                    await deps.linkTokens.consumeLinkToken(command.token, 'TELEGRAM', externalSenderId, externalChatId);
                    return 'Linked! You can now message the Assistant directly here.';
                }
                catch (error) {
                    if (error instanceof errors_1.ChannelError)
                        return error.message;
                    throw error;
                }
            }
            case 'status': {
                const connection = await deps.connections.getActiveConnection('TELEGRAM', externalSenderId);
                return connection ? `Linked since ${connection.linkedAt.toISOString()}.` : NOT_LINKED_MESSAGE;
            }
            case 'new': {
                const connection = await deps.connections.getActiveConnection('TELEGRAM', externalSenderId);
                if (!connection)
                    return NOT_LINKED_MESSAGE;
                await deps.connections.setCurrentConversation(connection.id, null);
                return 'Started a new conversation.';
            }
            case 'unlink': {
                const connection = await deps.connections.getActiveConnection('TELEGRAM', externalSenderId);
                if (!connection)
                    return NOT_LINKED_MESSAGE;
                await deps.connections.revoke(connection.userId, 'TELEGRAM');
                return 'This Telegram account has been disconnected.';
            }
            case 'unknown':
                return `Unrecognized command.\n\n${HELP_TEXT}`;
        }
    }
    async function handlePlainText(text, externalSenderId, correlationId) {
        const connection = await deps.connections.getActiveConnection('TELEGRAM', externalSenderId);
        if (!connection)
            return NOT_LINKED_MESSAGE;
        if (!deps.assistantProviderRuntime)
            return PROVIDER_UNAVAILABLE_MESSAGE;
        const elapsed = (0, logger_1.startTimer)();
        (0, logger_1.logEvent)('info', { event: 'channel.assistant.started', requestId: correlationId, provider: 'telegram' });
        try {
            const result = await deps.assistantProviderRuntime.sendMessage(connection.userId, correlationId, {
                message: text,
                ...(connection.conversationId ? { conversationId: connection.conversationId } : {}),
            });
            (0, logger_1.logEvent)('info', {
                event: 'channel.assistant.completed',
                requestId: correlationId,
                provider: 'telegram',
                durationMs: elapsed(),
                outcome: result.response.status,
            });
            const responseConversationId = result.response.conversationId;
            if (responseConversationId && responseConversationId !== connection.conversationId) {
                await deps.connections.setCurrentConversation(connection.id, responseConversationId);
            }
            if (result.response.status === 'clarification_required' || draftWasCreated(result.response)) {
                return WEB_HANDOFF_MESSAGE;
            }
            const message = result.response.message
                ?? result.response.renderedText;
            return message ?? WEB_HANDOFF_MESSAGE;
        }
        catch (error) {
            (0, logger_1.logEvent)('warn', { event: 'channel.assistant.failed', requestId: correlationId, provider: 'telegram', durationMs: elapsed() });
            throw error;
        }
    }
    function truncate(text) {
        if (text.length <= MAX_OUTBOUND_LENGTH)
            return text;
        return `${text.slice(0, MAX_OUTBOUND_LENGTH)}\n\n[message truncated]`;
    }
    async function deliver(externalChatId, text, correlationId) {
        (0, logger_1.logEvent)('info', { event: 'channel.delivery.started', requestId: correlationId, provider: 'telegram' });
        const outcome = await deps.client.sendMessage(externalChatId, truncate(text));
        if (outcome.ok) {
            (0, logger_1.logEvent)('info', { event: 'channel.delivery.completed', requestId: correlationId, provider: 'telegram' });
        }
        else {
            (0, logger_1.logEvent)('warn', { event: 'channel.delivery.failed', requestId: correlationId, provider: 'telegram', errorCategory: outcome.category });
        }
    }
    /** Entry point for the webhook controller. Never throws for unsupported/duplicate updates — always safely acknowledged. */
    async function handleUpdate(rawUpdate, correlationId) {
        const envelope = (0, envelope_1.normalizeTelegramUpdate)(rawUpdate);
        if (!envelope) {
            (0, logger_1.logEvent)('info', { event: 'channel.webhook.received', requestId: correlationId, provider: 'telegram', outcome: 'unsupported' });
            return;
        }
        const isNew = await (0, dedup_1.claimTelegramUpdate)(deps.db, envelope.externalUpdateId);
        if (!isNew) {
            (0, logger_1.logEvent)('info', { event: 'channel.update.duplicate', requestId: correlationId, provider: 'telegram' });
            return;
        }
        (0, logger_1.logEvent)('info', { event: 'channel.webhook.received', requestId: correlationId, provider: 'telegram', outcome: 'accepted' });
        const command = (0, commands_1.parseTelegramCommand)(envelope.text);
        const reply = command
            ? await handleCommand(command, envelope.externalSenderId, envelope.externalChatId)
            : await handlePlainText(envelope.text, envelope.externalSenderId, correlationId);
        await deliver(envelope.externalChatId, reply, correlationId);
    }
    return { handleUpdate };
}
//# sourceMappingURL=telegram.service.js.map
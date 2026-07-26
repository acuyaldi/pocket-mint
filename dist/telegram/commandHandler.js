"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOT_LINKED_MESSAGE = void 0;
exports.handleTelegramCommand = handleTelegramCommand;
const errors_1 = require("../channels/errors");
exports.NOT_LINKED_MESSAGE = 'Your Telegram account is not linked yet. Open Pocket Mint on the web, generate a linking code, then send /link <code> here.';
const HELP_TEXT = [
    'Available commands:',
    '/link <code> — link this Telegram account to your Pocket Mint account',
    '/status — show your linking status',
    '/new — start a new conversation',
    '/unlink — disconnect this Telegram account',
    '/help — show this message',
].join('\n');
/** Deterministic, DB-only command handling — no Assistant/network calls. Reused by the inbound worker. */
async function handleTelegramCommand(deps, command, externalSenderId, externalChatId) {
    switch (command.name) {
        case 'start':
            return `Welcome to Pocket Mint. ${exports.NOT_LINKED_MESSAGE}\n\n${HELP_TEXT}`;
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
            return connection ? `Linked since ${connection.linkedAt.toISOString()}.` : exports.NOT_LINKED_MESSAGE;
        }
        case 'new': {
            const connection = await deps.connections.getActiveConnection('TELEGRAM', externalSenderId);
            if (!connection)
                return exports.NOT_LINKED_MESSAGE;
            await deps.connections.setCurrentConversation(connection.id, null);
            return 'Started a new conversation.';
        }
        case 'unlink': {
            const connection = await deps.connections.getActiveConnection('TELEGRAM', externalSenderId);
            if (!connection)
                return exports.NOT_LINKED_MESSAGE;
            await deps.connections.revoke(connection.userId, 'TELEGRAM');
            return 'This Telegram account has been disconnected.';
        }
        case 'unknown':
            return `Unrecognized command.\n\n${HELP_TEXT}`;
    }
}
//# sourceMappingURL=commandHandler.js.map
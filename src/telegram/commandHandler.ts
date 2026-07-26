import type { ChannelLinkTokenService } from '../channels/linkToken.service';
import type { ChannelConnectionService } from '../channels/connection.service';
import type { TelegramCommand } from './commands';
import { ChannelError } from '../channels/errors';

export const NOT_LINKED_MESSAGE =
  'Your Telegram account is not linked yet. Open Pocket Mint on the web, generate a linking code, then send /link <code> here.';

const HELP_TEXT = [
  'Available commands:',
  '/link <code> — link this Telegram account to your Pocket Mint account',
  '/status — show your linking status',
  '/new — start a new conversation',
  '/unlink — disconnect this Telegram account',
  '/help — show this message',
].join('\n');

export interface CommandHandlerDeps {
  readonly linkTokens: ChannelLinkTokenService;
  readonly connections: ChannelConnectionService;
}

/** Deterministic, DB-only command handling — no Assistant/network calls. Reused by the inbound worker. */
export async function handleTelegramCommand(
  deps: CommandHandlerDeps,
  command: TelegramCommand,
  externalSenderId: string,
  externalChatId: string,
): Promise<string> {
  switch (command.name) {
    case 'start':
      return `Welcome to Pocket Mint. ${NOT_LINKED_MESSAGE}\n\n${HELP_TEXT}`;
    case 'help':
      return HELP_TEXT;
    case 'link': {
      try {
        await deps.linkTokens.consumeLinkToken(command.token, 'TELEGRAM', externalSenderId, externalChatId);
        return 'Linked! You can now message the Assistant directly here.';
      } catch (error) {
        if (error instanceof ChannelError) return error.message;
        throw error;
      }
    }
    case 'status': {
      const connection = await deps.connections.getActiveConnection('TELEGRAM', externalSenderId);
      return connection ? `Linked since ${connection.linkedAt.toISOString()}.` : NOT_LINKED_MESSAGE;
    }
    case 'new': {
      const connection = await deps.connections.getActiveConnection('TELEGRAM', externalSenderId);
      if (!connection) return NOT_LINKED_MESSAGE;
      await deps.connections.setCurrentConversation(connection.id, null);
      return 'Started a new conversation.';
    }
    case 'unlink': {
      const connection = await deps.connections.getActiveConnection('TELEGRAM', externalSenderId);
      if (!connection) return NOT_LINKED_MESSAGE;
      await deps.connections.revoke(connection.userId, 'TELEGRAM');
      return 'This Telegram account has been disconnected.';
    }
    case 'unknown':
      return `Unrecognized command.\n\n${HELP_TEXT}`;
  }
}

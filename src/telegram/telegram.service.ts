import type { PrismaClient } from '../generated/prisma/client';
import type { ChannelLinkTokenService } from '../channels/linkToken.service';
import type { ChannelConnectionService } from '../channels/connection.service';
import type { TelegramClient } from './client';
import type { AssistantProviderRuntime } from '../assistant/provider-runtime';
import { normalizeTelegramUpdate } from './envelope';
import { parseTelegramCommand, type TelegramCommand } from './commands';
import { claimTelegramUpdate } from './dedup';
import { ChannelError } from '../channels/errors';
import { logEvent, startTimer } from '../utils/logger';

const MAX_OUTBOUND_LENGTH = 4000;
const WEB_HANDOFF_MESSAGE =
  'Please continue in the Pocket Mint web app to review and confirm this — Telegram cannot complete this step yet.';
const NOT_LINKED_MESSAGE =
  'Your Telegram account is not linked yet. Open Pocket Mint on the web, generate a linking code, then send /link <code> here.';
const PROVIDER_UNAVAILABLE_MESSAGE = 'The Assistant is not available right now. Please try again later.';

const HELP_TEXT = [
  'Available commands:',
  '/link <code> — link this Telegram account to your Pocket Mint account',
  '/status — show your linking status',
  '/new — start a new conversation',
  '/unlink — disconnect this Telegram account',
  '/help — show this message',
].join('\n');

export interface TelegramServiceDeps {
  readonly db: PrismaClient;
  readonly linkTokens: ChannelLinkTokenService;
  readonly connections: ChannelConnectionService;
  readonly client: TelegramClient;
  readonly assistantProviderRuntime?: AssistantProviderRuntime;
}

/** Bounded boolean signal only — mirrors assistant.controller.ts's draftWasCreated. */
function draftWasCreated(response: unknown): boolean {
  if (typeof response !== 'object' || response === null) return false;
  const value = response as { status?: unknown; data?: { confirmationRequired?: unknown } };
  return value.status === 'success' && value.data?.confirmationRequired === true;
}

export function createTelegramService(deps: TelegramServiceDeps) {
  async function handleCommand(command: TelegramCommand, externalSenderId: string, externalChatId: string): Promise<string> {
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

  async function handlePlainText(text: string, externalSenderId: string, correlationId: string): Promise<string> {
    const connection = await deps.connections.getActiveConnection('TELEGRAM', externalSenderId);
    if (!connection) return NOT_LINKED_MESSAGE;
    if (!deps.assistantProviderRuntime) return PROVIDER_UNAVAILABLE_MESSAGE;

    const elapsed = startTimer();
    logEvent('info', { event: 'channel.assistant.started', requestId: correlationId, provider: 'telegram' });
    try {
      const result = await deps.assistantProviderRuntime.sendMessage(connection.userId, correlationId, {
        message: text,
        ...(connection.conversationId ? { conversationId: connection.conversationId } : {}),
      });
      logEvent('info', {
        event: 'channel.assistant.completed',
        requestId: correlationId,
        provider: 'telegram',
        durationMs: elapsed(),
        outcome: result.response.status,
      });

      const responseConversationId = (result.response as { conversationId?: string }).conversationId;
      if (responseConversationId && responseConversationId !== connection.conversationId) {
        await deps.connections.setCurrentConversation(connection.id, responseConversationId);
      }

      if (result.response.status === 'clarification_required' || draftWasCreated(result.response)) {
        return WEB_HANDOFF_MESSAGE;
      }
      const message = (result.response as { message?: string; renderedText?: string }).message
        ?? (result.response as { renderedText?: string }).renderedText;
      return message ?? WEB_HANDOFF_MESSAGE;
    } catch (error) {
      logEvent('warn', { event: 'channel.assistant.failed', requestId: correlationId, provider: 'telegram', durationMs: elapsed() });
      throw error;
    }
  }

  function truncate(text: string): string {
    if (text.length <= MAX_OUTBOUND_LENGTH) return text;
    return `${text.slice(0, MAX_OUTBOUND_LENGTH)}\n\n[message truncated]`;
  }

  async function deliver(externalChatId: string, text: string, correlationId: string): Promise<void> {
    logEvent('info', { event: 'channel.delivery.started', requestId: correlationId, provider: 'telegram' });
    const outcome = await deps.client.sendMessage(externalChatId, truncate(text));
    if (outcome.ok) {
      logEvent('info', { event: 'channel.delivery.completed', requestId: correlationId, provider: 'telegram' });
    } else {
      logEvent('warn', { event: 'channel.delivery.failed', requestId: correlationId, provider: 'telegram', errorCategory: outcome.category });
    }
  }

  /** Entry point for the webhook controller. Never throws for unsupported/duplicate updates — always safely acknowledged. */
  async function handleUpdate(rawUpdate: unknown, correlationId: string): Promise<void> {
    const envelope = normalizeTelegramUpdate(rawUpdate);
    if (!envelope) {
      logEvent('info', { event: 'channel.webhook.received', requestId: correlationId, provider: 'telegram', outcome: 'unsupported' });
      return;
    }

    const isNew = await claimTelegramUpdate(deps.db, envelope.externalUpdateId);
    if (!isNew) {
      logEvent('info', { event: 'channel.update.duplicate', requestId: correlationId, provider: 'telegram' });
      return;
    }
    logEvent('info', { event: 'channel.webhook.received', requestId: correlationId, provider: 'telegram', outcome: 'accepted' });

    const command = parseTelegramCommand(envelope.text);
    const reply = command
      ? await handleCommand(command, envelope.externalSenderId, envelope.externalChatId)
      : await handlePlainText(envelope.text, envelope.externalSenderId, correlationId);

    await deliver(envelope.externalChatId, reply, correlationId);
  }

  return { handleUpdate };
}

export type TelegramService = ReturnType<typeof createTelegramService>;

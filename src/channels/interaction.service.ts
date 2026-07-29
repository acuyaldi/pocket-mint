// ============================================================
// Channel interaction orchestration — the ONLY place a callback job's
// button press is turned into an authoritative action.
// ------------------------------------------------------------
// Re-derives ownership entirely server-side (never trusts Telegram callback
// data as an identifier), then calls the exact same clarification/draft
// application-service methods the web HTTP path uses, via the
// AssistantProviderRuntime passthroughs — no parallel financial logic, no
// natural-language interpretation, no direct transaction creation. See
// docs/product/decisions/016 and test/channels/telegramAdapterBoundary.test.ts.
// ============================================================

import type { PrismaClient } from '../generated/prisma/client';
import type { AssistantProviderRuntime } from '../assistant/provider-runtime';
import { AssistantError } from '../assistant/errors';
import type { ClaimedInboundJob } from './workers/claim';
import {
  findCallbackTokenByRaw,
  claimCallbackToken,
  expireCallbackToken,
  createCallbackToken,
  type ChannelCallbackInteractionType,
} from './callbackToken.service';
import type { CallbackActionResult, InteractionButton } from './interaction.types';
import { logEvent } from '../utils/logger';

export interface ChannelInteractionDeps {
  readonly db: PrismaClient;
  readonly providerRuntime: AssistantProviderRuntime;
}

const TERMINAL_MESSAGES: Record<string, string> = {
  not_found: 'This action is no longer available. Please restart in the app or send a new message.',
  consumed: 'This action was already handled.',
  expired: 'This action has expired. Please restart in the app or send a new message.',
  cancelled: 'This action was already cancelled.',
  stale: 'This is no longer valid — the conversation has moved on. Please restart in the app or send a new message.',
  connection_revoked: 'Your Telegram connection is no longer active. Please relink your account in the app.',
  restart_required: 'This action could not be completed. Please restart in the app or send a new message.',
};

function terminal(status: string, clearOriginalKeyboard = true): CallbackActionResult {
  return { terminalStatus: status, replyText: TERMINAL_MESSAGES[status] ?? TERMINAL_MESSAGES.restart_required!, clearOriginalKeyboard };
}

function mapTokenStatus(status: string): string {
  switch (status) {
    case 'CONSUMED': return 'consumed';
    case 'EXPIRED': return 'expired';
    case 'CANCELLED': return 'cancelled';
    case 'STALE': return 'stale';
    default: return 'restart_required';
  }
}

function mapAssistantErrorToStatus(error: AssistantError): string {
  switch (error.code) {
    case 'ASSISTANT_CLARIFICATION_ALREADY_CONSUMED': return 'consumed';
    case 'ASSISTANT_CLARIFICATION_CANCELLED': return 'cancelled';
    case 'ASSISTANT_CLARIFICATION_EXPIRED': return 'expired';
    case 'ASSISTANT_CLARIFICATION_STALE': return 'stale';
    case 'ASSISTANT_CLARIFICATION_NOT_FOUND': return 'not_found';
    case 'ASSISTANT_CLARIFICATION_INVALID_OPTION': return 'not_found';
    case 'ASSISTANT_DRAFT_CONFLICT': return error.detail === 'EXPIRED' ? 'expired' : 'conflict';
    case 'ASSISTANT_IDEMPOTENCY_CONFLICT': return 'conflict';
    case 'ASSISTANT_DRAFT_NOT_FOUND': return 'not_found';
    default: return 'failed';
  }
}

/** Persists one ChannelCallbackToken per option and builds the neutral button descriptors for a fresh clarification. */
async function buildClarificationKeyboard(
  db: PrismaClient,
  connectionId: string,
  conversationId: string,
  projection: { clarificationId: string; options: readonly { token: string; label: string; discriminator?: string }[] },
): Promise<InteractionButton[]> {
  const buttons: InteractionButton[] = [];
  for (const option of projection.options) {
    const created = await createCallbackToken(db, {
      connectionId,
      conversationId,
      interactionType: 'CLARIFICATION_SELECT',
      clarificationRequestId: projection.clarificationId,
      actionSecret: option.token,
    });
    buttons.push({ label: option.label, ...(option.discriminator ? { discriminator: option.discriminator } : {}), token: created.token });
  }
  const cancel = await createCallbackToken(db, {
    connectionId,
    conversationId,
    interactionType: 'CLARIFICATION_CANCEL',
    clarificationRequestId: projection.clarificationId,
  });
  buttons.push({ label: 'Cancel', token: cancel.token });
  return buttons;
}

async function buildDraftKeyboard(
  db: PrismaClient,
  connectionId: string,
  conversationId: string,
  draftId: string,
): Promise<InteractionButton[]> {
  const confirm = await createCallbackToken(db, { connectionId, conversationId, interactionType: 'DRAFT_CONFIRM', financialDraftId: draftId });
  const cancel = await createCallbackToken(db, { connectionId, conversationId, interactionType: 'DRAFT_CANCEL', financialDraftId: draftId });
  return [
    { label: 'Confirm', token: confirm.token },
    { label: 'Cancel', token: cancel.token },
  ];
}

/**
 * Interprets an AssistantApplicationResult (from a callback-driven
 * clarification select/cancel, OR the very first message-path Assistant
 * turn) into a bounded interaction result, chaining a new keyboard when the
 * result unlocked a further clarification or draft. Exported so the
 * inbound-message worker can render buttons for a fresh Assistant turn too,
 * not only for callback follow-ups.
 */
export async function renderApplicationResult(
  db: PrismaClient,
  connectionId: string,
  conversationId: string,
  result: { readonly response: unknown },
): Promise<CallbackActionResult> {
  const response = result.response as {
    status: string;
    message?: string;
    renderedText?: string;
    data?: {
      kind?: string;
      clarification?: { clarificationId: string; prompt?: string; options?: readonly { token: string; label: string; discriminator?: string }[] };
      draftId?: string;
      status?: string;
    };
  };

  if (response.status === 'clarification_required' && response.data?.kind === 'entity_selection' && response.data.clarification?.options) {
    const buttons = await buildClarificationKeyboard(db, connectionId, conversationId, {
      clarificationId: response.data.clarification.clarificationId,
      options: response.data.clarification.options,
    });
    return {
      terminalStatus: 'clarification_advanced',
      replyText: response.data.clarification.prompt ?? response.message ?? 'Please choose one option.',
      keyboard: { rows: buttons.map((b) => [b]) },
      clearOriginalKeyboard: true,
    };
  }

  if (response.status === 'clarification_required' && response.data?.kind === 'guided_fields') {
    return {
      terminalStatus: 'guided_fields_handoff',
      replyText: response.message ?? 'Please continue in the Pocket Mint web app to complete this clarification.',
      clearOriginalKeyboard: true,
    };
  }

  if (response.status === 'success' && response.data?.draftId) {
    const buttons = await buildDraftKeyboard(db, connectionId, conversationId, response.data.draftId);
    return {
      terminalStatus: 'draft_ready',
      replyText: response.renderedText ?? 'A transaction draft is ready for confirmation.',
      keyboard: { rows: [buttons] },
      clearOriginalKeyboard: true,
    };
  }

  if (response.status === 'success') {
    return { terminalStatus: 'success', replyText: response.message ?? response.renderedText ?? 'Done.', clearOriginalKeyboard: true };
  }

  return { terminalStatus: 'failed', replyText: response.message ?? 'This action could not be completed.', clearOriginalKeyboard: true };
}

/**
 * The single entry point for a CALLBACK job. Re-derives every piece of
 * ownership server-side before calling any authoritative service, and
 * atomically claims the callback token as the race gate between two
 * independent button presses on the same token (mirrors the Persistent
 * Clarification Engine's own PENDING->CONSUMED claim).
 */
export async function processCallback(
  deps: ChannelInteractionDeps,
  job: ClaimedInboundJob,
  correlationId: string,
): Promise<CallbackActionResult> {
  const found = await findCallbackTokenByRaw(deps.db, job.text);
  if (!found) {
    logEvent('info', { event: 'channel.callback.terminal', requestId: correlationId, provider: 'telegram', terminalStatus: 'not_found' });
    return terminal('not_found');
  }

  if (found.status !== 'PENDING') {
    const status = mapTokenStatus(found.status);
    logEvent('info', { event: 'channel.callback.terminal', requestId: correlationId, provider: 'telegram', terminalStatus: status, interactionType: found.interactionType });
    return terminal(status);
  }

  if (found.expiresAt.getTime() <= Date.now()) {
    await expireCallbackToken(deps.db, found.id);
    logEvent('info', { event: 'channel.callback.token_expired', requestId: correlationId, provider: 'telegram', interactionType: found.interactionType });
    return terminal('expired');
  }

  const connection = await deps.db.channelConnection.findUnique({ where: { id: found.connectionId } });
  if (!connection || connection.status !== 'ACTIVE') {
    logEvent('warn', { event: 'channel.callback.rejected', requestId: correlationId, provider: 'telegram', outcome: 'connection_revoked' });
    return terminal('connection_revoked');
  }

  if (connection.externalUserId !== job.externalSenderId) {
    // Never reveal *why* — from Telegram's perspective this looks identical to a stale/expired button.
    logEvent('warn', { event: 'channel.callback.rejected', requestId: correlationId, provider: 'telegram', outcome: 'identity_mismatch' });
    return terminal('restart_required');
  }

  if (found.conversationId !== connection.conversationId) {
    logEvent('info', { event: 'channel.callback.terminal', requestId: correlationId, provider: 'telegram', terminalStatus: 'stale' });
    return terminal('stale');
  }

  const claimed = await claimCallbackToken(deps.db, found.id);
  if (!claimed) {
    const current = await deps.db.channelCallbackToken.findUniqueOrThrow({ where: { id: found.id } });
    const status = mapTokenStatus(current.status);
    logEvent('info', { event: 'channel.callback.duplicate', requestId: correlationId, provider: 'telegram', terminalStatus: status });
    return terminal(status);
  }
  logEvent('info', { event: 'channel.callback.token_consumed', requestId: correlationId, provider: 'telegram', interactionType: found.interactionType });

  const userId = connection.userId;
  const interactionType = found.interactionType as ChannelCallbackInteractionType;

  try {
    if (interactionType === 'CLARIFICATION_SELECT') {
      if (!found.actionSecret || !found.clarificationRequestId) return terminal('restart_required');
      const result = await deps.providerRuntime.selectClarification(userId, correlationId, found.actionSecret, found.conversationId, found.clarificationRequestId);
      return await renderApplicationResult(deps.db, found.connectionId, found.conversationId, result);
    }
    if (interactionType === 'CLARIFICATION_CANCEL') {
      if (!found.clarificationRequestId) return terminal('restart_required');
      const result = await deps.providerRuntime.cancelClarification(userId, correlationId, found.clarificationRequestId, found.conversationId);
      return await renderApplicationResult(deps.db, found.connectionId, found.conversationId, result);
    }
    if (interactionType === 'DRAFT_CONFIRM') {
      if (!found.financialDraftId) return terminal('restart_required');
      const idempotencyKey = `channel:telegram:${found.id}`;
      const result = await deps.providerRuntime.confirmDraft(userId, found.financialDraftId, idempotencyKey, correlationId);
      return { terminalStatus: result.status.toLowerCase(), replyText: result.renderedText, clearOriginalKeyboard: true };
    }
    // DRAFT_CANCEL
    if (!found.financialDraftId) return terminal('restart_required');
    const result = await deps.providerRuntime.cancelDraft(userId, found.financialDraftId, correlationId);
    const cancelReply = 'renderedText' in result ? result.renderedText : `Draft ${result.draftId} has expired.`;
    return { terminalStatus: result.status.toLowerCase(), replyText: cancelReply, clearOriginalKeyboard: true };
  } catch (error) {
    const status = error instanceof AssistantError ? mapAssistantErrorToStatus(error) : 'failed';
    const message = error instanceof AssistantError ? error.message : 'This action could not be completed.';
    logEvent('warn', { event: 'channel.callback.rejected', requestId: correlationId, provider: 'telegram', outcome: status });
    return { terminalStatus: status, replyText: message, clearOriginalKeyboard: true };
  }
}

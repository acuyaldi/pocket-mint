import { describe, expect, it, vi } from 'vitest';
import { processDelivery, type OutboundWorkerDeps } from '../../../src/channels/workers/outbound.worker';
import type { ClaimedDelivery } from '../../../src/channels/workers/claim';

function delivery(overrides: Partial<ClaimedDelivery> = {}): ClaimedDelivery {
  return { id: 'del-1', inboundJobId: 'job-1', kind: 'SEND_MESSAGE', destinationChatId: 'chat-1', renderedText: 'hello', replyMarkup: null, targetMessageId: null, attempt: 1, ...overrides };
}

function buildDeps(overrides: Partial<OutboundWorkerDeps> = {}): OutboundWorkerDeps {
  const updates: Array<Record<string, unknown>> = [];
  return {
    db: { channelOutboundDelivery: { update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return data; }) }, __updates: updates } as never,
    client: { sendMessage: vi.fn(), editMessageReplyMarkup: vi.fn(), answerCallbackQuery: vi.fn(), setWebhook: vi.fn(), deleteWebhook: vi.fn() } as never,
    config: { workersEnabled: true, inboundPollMs: 1, outboundPollMs: 1, batchSize: 10, leaseMs: 1000, maxAttemptsInbound: 5, maxAttemptsOutbound: 5, retentionDays: 7 },
    owner: 'test-owner',
    ...overrides,
  };
}

describe('processDelivery', () => {
  it('marks SENT on a successful send', async () => {
    const client = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), setWebhook: vi.fn(), deleteWebhook: vi.fn() };
    const deps = buildDeps({ client: client as never });
    await processDelivery(deps, delivery());
    const updates = (deps.db as never as { __updates: Array<Record<string, unknown>> }).__updates;
    expect(updates.at(-1)).toMatchObject({ status: 'SENT' });
  });

  it('schedules a retry for a retryable Telegram failure', async () => {
    const client = { sendMessage: vi.fn().mockResolvedValue({ ok: false, category: 'provider_unavailable' }), setWebhook: vi.fn(), deleteWebhook: vi.fn() };
    const deps = buildDeps({ client: client as never });
    await processDelivery(deps, delivery({ attempt: 1 }));
    const updates = (deps.db as never as { __updates: Array<Record<string, unknown>> }).__updates;
    expect(updates.at(-1)).toMatchObject({ status: 'FAILED_RETRYABLE', errorCategory: 'provider_unavailable' });
  });

  it('goes terminal immediately for an invalid/malformed request', async () => {
    const client = { sendMessage: vi.fn().mockResolvedValue({ ok: false, category: 'provider_invalid_response' }), setWebhook: vi.fn(), deleteWebhook: vi.fn() };
    const deps = buildDeps({ client: client as never });
    await processDelivery(deps, delivery({ attempt: 1 }));
    const updates = (deps.db as never as { __updates: Array<Record<string, unknown>> }).__updates;
    expect(updates.at(-1)).toMatchObject({ status: 'FAILED_TERMINAL', errorCategory: 'provider_invalid_response' });
  });

  it('goes terminal once retryable attempts are exhausted', async () => {
    const client = { sendMessage: vi.fn().mockResolvedValue({ ok: false, category: 'provider_rate_limit' }), setWebhook: vi.fn(), deleteWebhook: vi.fn() };
    const deps = buildDeps({ client: client as never });
    await processDelivery(deps, delivery({ attempt: 5 }));
    const updates = (deps.db as never as { __updates: Array<Record<string, unknown>> }).__updates;
    expect(updates.at(-1)).toMatchObject({ status: 'FAILED_TERMINAL' });
  });

  it('never re-invokes the Assistant or any other service — delivery retry is delivery-only', async () => {
    const client = { sendMessage: vi.fn().mockResolvedValue({ ok: false, category: 'provider_unavailable' }), setWebhook: vi.fn(), deleteWebhook: vi.fn() };
    const deps = buildDeps({ client: client as never });
    await processDelivery(deps, delivery());
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage).toHaveBeenCalledWith('chat-1', 'hello');
  });

  it('captures providerMessageId on a successful SEND_MESSAGE', async () => {
    const client = { sendMessage: vi.fn().mockResolvedValue({ ok: true, messageId: '555' }), editMessageReplyMarkup: vi.fn(), answerCallbackQuery: vi.fn(), setWebhook: vi.fn(), deleteWebhook: vi.fn() };
    const deps = buildDeps({ client: client as never });
    await processDelivery(deps, delivery());
    const updates = (deps.db as never as { __updates: Array<Record<string, unknown>> }).__updates;
    expect(updates.at(-1)).toMatchObject({ status: 'SENT', providerMessageId: '555' });
  });

  it('passes replyMarkup through to sendMessage when present', async () => {
    const client = { sendMessage: vi.fn().mockResolvedValue({ ok: true }), editMessageReplyMarkup: vi.fn(), answerCallbackQuery: vi.fn(), setWebhook: vi.fn(), deleteWebhook: vi.fn() };
    const deps = buildDeps({ client: client as never });
    const keyboard = { inline_keyboard: [[{ text: 'Confirm', callback_data: 'cbk_1' }]] };
    await processDelivery(deps, delivery({ replyMarkup: keyboard }));
    expect(client.sendMessage).toHaveBeenCalledWith('chat-1', 'hello', keyboard);
  });

  it('EDIT_REPLY_MARKUP kind calls editMessageReplyMarkup targeting targetMessageId, never sendMessage', async () => {
    const client = { sendMessage: vi.fn(), editMessageReplyMarkup: vi.fn().mockResolvedValue({ ok: true }), answerCallbackQuery: vi.fn(), setWebhook: vi.fn(), deleteWebhook: vi.fn() };
    const deps = buildDeps({ client: client as never });
    await processDelivery(deps, delivery({ kind: 'EDIT_REPLY_MARKUP', targetMessageId: '900', renderedText: '' }));
    expect(client.editMessageReplyMarkup).toHaveBeenCalledWith('chat-1', '900');
    expect(client.sendMessage).not.toHaveBeenCalled();
    const updates = (deps.db as never as { __updates: Array<Record<string, unknown>> }).__updates;
    expect(updates.at(-1)).toMatchObject({ status: 'SENT' });
  });

  it('a failed keyboard cleanup (EDIT_REPLY_MARKUP) does not roll back or repeat the underlying domain action — it only retries/fails the delivery row', async () => {
    const client = { sendMessage: vi.fn(), editMessageReplyMarkup: vi.fn().mockResolvedValue({ ok: false, category: 'provider_invalid_response' }), answerCallbackQuery: vi.fn(), setWebhook: vi.fn(), deleteWebhook: vi.fn() };
    const deps = buildDeps({ client: client as never });
    await processDelivery(deps, delivery({ kind: 'EDIT_REPLY_MARKUP', targetMessageId: '900', renderedText: '', attempt: 5 }));
    const updates = (deps.db as never as { __updates: Array<Record<string, unknown>> }).__updates;
    expect(updates.at(-1)).toMatchObject({ status: 'FAILED_TERMINAL' });
    expect(client.editMessageReplyMarkup).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { processCallback, renderApplicationResult } from '../../src/channels/interaction.service';
import { createCallbackToken } from '../../src/channels/callbackToken.service';
import { AssistantError } from '../../src/assistant/errors';
import type { ClaimedInboundJob } from '../../src/channels/workers/claim';

function job(overrides: Partial<ClaimedInboundJob> = {}): ClaimedInboundJob {
  return {
    id: 'job-1',
    provider: 'TELEGRAM',
    externalUpdateId: '1',
    channelConnectionId: 'conn-1',
    externalSenderId: 'tg-1',
    externalChatId: 'chat-1',
    text: 'placeholder-overwritten-in-tests',
    kind: 'CALLBACK',
    callbackQueryId: 'cbq-1',
    callbackMessageId: 'msg-1',
    attempt: 1,
    assistantTurnId: null,
    ...overrides,
  };
}

interface TokenRow {
  id: string;
  provider: string;
  tokenDigest: string;
  connectionId: string;
  conversationId: string;
  interactionType: string;
  clarificationRequestId: string | null;
  clarificationOptionId: string | null;
  financialDraftId: string | null;
  actionSecret: string | null;
  status: string;
  expiresAt: Date;
}

interface ConnectionRow {
  id: string;
  userId: string;
  externalUserId: string;
  conversationId: string | null;
  status: string;
}

function fakeDb(opts: { connection?: Partial<ConnectionRow> } = {}) {
  const tokens = new Map<string, TokenRow>();
  const connections = new Map<string, ConnectionRow>();
  connections.set('conn-1', { id: 'conn-1', userId: 'user-1', externalUserId: 'tg-1', conversationId: 'conv-1', status: 'ACTIVE', ...opts.connection });
  let seq = 0;

  return {
    tokens,
    connections,
    channelCallbackToken: {
      create: async ({ data }: { data: Partial<TokenRow> }) => {
        const id = `token-${++seq}`;
        const row: TokenRow = {
          id,
          provider: data.provider as string,
          tokenDigest: data.tokenDigest as string,
          connectionId: data.connectionId as string,
          conversationId: data.conversationId as string,
          interactionType: data.interactionType as string,
          clarificationRequestId: data.clarificationRequestId ?? null,
          clarificationOptionId: data.clarificationOptionId ?? null,
          financialDraftId: data.financialDraftId ?? null,
          actionSecret: data.actionSecret ?? null,
          status: 'PENDING',
          expiresAt: data.expiresAt as Date,
        };
        tokens.set(id, row);
        return row;
      },
      // Returns a shallow copy — a real Prisma read is a snapshot, not a live
      // reference, so a later updateMany() must not retroactively mutate an
      // already-returned row (this bit us with actionSecret before the fix).
      findUnique: async ({ where }: { where: { provider_tokenDigest?: { provider: string; tokenDigest: string }; id?: string } }) => {
        if (where.id) return tokens.has(where.id) ? { ...tokens.get(where.id)! } : null;
        for (const row of tokens.values()) {
          if (row.provider === where.provider_tokenDigest!.provider && row.tokenDigest === where.provider_tokenDigest!.tokenDigest) return { ...row };
        }
        return null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({ ...tokens.get(where.id)! }),
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Partial<TokenRow> }) => {
        const row = tokens.get(where.id);
        if (!row || row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    channelConnection: {
      findUnique: async ({ where }: { where: { id: string } }) => connections.get(where.id) ?? null,
    },
  } as never;
}

function fakeProviderRuntime(overrides: Record<string, unknown> = {}) {
  return {
    selectClarification: vi.fn(),
    cancelClarification: vi.fn(),
    confirmDraft: vi.fn(),
    cancelDraft: vi.fn(),
    getAssistantState: vi.fn(),
    ...overrides,
  } as never;
}

describe('interaction.service — processCallback (security resolution)', () => {
  it('returns not_found for a callback_data handle with no matching token', async () => {
    const db = fakeDb();
    const result = await processCallback({ db, providerRuntime: fakeProviderRuntime() }, job({ text: 'cbk_unknown' }), 'corr-1');
    expect(result.terminalStatus).toBe('not_found');
  });

  it('returns the actual terminal status for an already-CONSUMED token, without re-invoking the action', async () => {
    const db = fakeDb();
    const providerRuntime = fakeProviderRuntime();
    const { token, id } = await createCallbackToken(db, { connectionId: 'conn-1', conversationId: 'conv-1', interactionType: 'DRAFT_CANCEL', financialDraftId: 'draft-1' });
    await (db as ReturnType<typeof fakeDb>).channelCallbackToken.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'CONSUMED' } });
    const result = await processCallback({ db, providerRuntime }, job({ text: token }), 'corr-1');
    expect(result.terminalStatus).toBe('consumed');
    expect(providerRuntime.cancelDraft).not.toHaveBeenCalled();
  });

  it('lazily expires and rejects a token past its expiresAt', async () => {
    const db = fakeDb();
    const providerRuntime = fakeProviderRuntime();
    const { token, id } = await createCallbackToken(db, { connectionId: 'conn-1', conversationId: 'conv-1', interactionType: 'DRAFT_CONFIRM', financialDraftId: 'draft-1' });
    (db as ReturnType<typeof fakeDb>).tokens.get(id)!.expiresAt = new Date(Date.now() - 1000);
    const result = await processCallback({ db, providerRuntime }, job({ text: token }), 'corr-1');
    expect(result.terminalStatus).toBe('expired');
    expect((db as ReturnType<typeof fakeDb>).tokens.get(id)!.status).toBe('EXPIRED');
    expect(providerRuntime.confirmDraft).not.toHaveBeenCalled();
  });

  it('rejects when the bound connection has been revoked', async () => {
    const db = fakeDb({ connection: { status: 'REVOKED' } });
    const providerRuntime = fakeProviderRuntime();
    const { token } = await createCallbackToken(db, { connectionId: 'conn-1', conversationId: 'conv-1', interactionType: 'DRAFT_CONFIRM', financialDraftId: 'draft-1' });
    const result = await processCallback({ db, providerRuntime }, job({ text: token }), 'corr-1');
    expect(result.terminalStatus).toBe('connection_revoked');
    expect(providerRuntime.confirmDraft).not.toHaveBeenCalled();
  });

  it('rejects when the callback sender does not match the connection identity (never trusts Telegram-supplied identity)', async () => {
    const db = fakeDb();
    const providerRuntime = fakeProviderRuntime();
    const { token } = await createCallbackToken(db, { connectionId: 'conn-1', conversationId: 'conv-1', interactionType: 'DRAFT_CONFIRM', financialDraftId: 'draft-1' });
    const result = await processCallback({ db, providerRuntime }, job({ text: token, externalSenderId: 'someone-else' }), 'corr-1');
    expect(result.terminalStatus).toBe('restart_required');
    expect(providerRuntime.confirmDraft).not.toHaveBeenCalled();
  });

  it('rejects a token bound to a different (stale) conversation than the connection currently holds', async () => {
    const db = fakeDb({ connection: { conversationId: 'conv-newer' } });
    const providerRuntime = fakeProviderRuntime();
    const { token } = await createCallbackToken(db, { connectionId: 'conn-1', conversationId: 'conv-old', interactionType: 'DRAFT_CONFIRM', financialDraftId: 'draft-1' });
    const result = await processCallback({ db, providerRuntime }, job({ text: token }), 'corr-1');
    expect(result.terminalStatus).toBe('stale');
    expect(providerRuntime.confirmDraft).not.toHaveBeenCalled();
  });

  it('DRAFT_CONFIRM: calls providerRuntime.confirmDraft exactly once and clears the original keyboard', async () => {
    const db = fakeDb();
    const providerRuntime = fakeProviderRuntime({
      confirmDraft: vi.fn().mockResolvedValue({ draftId: 'draft-1', status: 'COMMITTED', transactionId: 'txn-1', conversationId: 'conv-1', turnId: 'turn-1', renderedText: 'Confirmed.', idempotencyOutcome: 'new' }),
    });
    const { token } = await createCallbackToken(db, { connectionId: 'conn-1', conversationId: 'conv-1', interactionType: 'DRAFT_CONFIRM', financialDraftId: 'draft-1' });
    const result = await processCallback({ db, providerRuntime }, job({ text: token }), 'corr-1');
    expect(providerRuntime.confirmDraft).toHaveBeenCalledTimes(1);
    expect(providerRuntime.confirmDraft).toHaveBeenCalledWith('user-1', 'draft-1', expect.any(String), 'corr-1');
    expect(result.terminalStatus).toBe('committed');
    expect(result.clearOriginalKeyboard).toBe(true);
  });

  it('a second callback press on the same token after the first already won does not call the action again (cross-job race gate)', async () => {
    const db = fakeDb();
    const providerRuntime = fakeProviderRuntime({
      confirmDraft: vi.fn().mockResolvedValue({ draftId: 'draft-1', status: 'COMMITTED', transactionId: 'txn-1', conversationId: 'conv-1', turnId: 'turn-1', renderedText: 'Confirmed.', idempotencyOutcome: 'new' }),
    });
    const { token } = await createCallbackToken(db, { connectionId: 'conn-1', conversationId: 'conv-1', interactionType: 'DRAFT_CONFIRM', financialDraftId: 'draft-1' });
    const first = await processCallback({ db, providerRuntime }, job({ id: 'job-1', text: token }), 'corr-1');
    const second = await processCallback({ db, providerRuntime }, job({ id: 'job-2', text: token }), 'corr-2');
    expect(first.terminalStatus).toBe('committed');
    expect(second.terminalStatus).toBe('consumed');
    expect(providerRuntime.confirmDraft).toHaveBeenCalledTimes(1);
  });

  it('maps a thrown AssistantError (e.g. draft conflict) to a bounded terminal status without leaking internals', async () => {
    const db = fakeDb();
    const providerRuntime = fakeProviderRuntime({ confirmDraft: vi.fn().mockRejectedValue(AssistantError.draftConflict('TERMINAL')) });
    const { token } = await createCallbackToken(db, { connectionId: 'conn-1', conversationId: 'conv-1', interactionType: 'DRAFT_CONFIRM', financialDraftId: 'draft-1' });
    const result = await processCallback({ db, providerRuntime }, job({ text: token }), 'corr-1');
    expect(result.terminalStatus).toBe('conflict');
  });

  it('CLARIFICATION_SELECT passes the wrapped actionSecret (never the callback token itself) to selectClarification', async () => {
    const db = fakeDb();
    const providerRuntime = fakeProviderRuntime({
      selectClarification: vi.fn().mockResolvedValue({ httpStatus: 200, response: { status: 'success', renderedText: 'Draft ready.', data: { draftId: 'draft-9' }, correlationId: 'corr-1', conversationId: 'conv-1', turnId: 'turn-1' } }),
    });
    const { token } = await createCallbackToken(db, { connectionId: 'conn-1', conversationId: 'conv-1', interactionType: 'CLARIFICATION_SELECT', clarificationRequestId: 'cr-1', actionSecret: 'clarify_raw-secret' });
    await processCallback({ db, providerRuntime }, job({ text: token }), 'corr-1');
    expect(providerRuntime.selectClarification).toHaveBeenCalledWith('user-1', 'corr-1', 'clarify_raw-secret', 'conv-1', 'cr-1');
  });
});

describe('interaction.service — renderApplicationResult', () => {
  it('wraps only entity_selection clarification options in callback tokens', async () => {
    const db = fakeDb();

    const result = await renderApplicationResult(db, 'conn-1', 'conv-1', {
      response: {
        status: 'clarification_required',
        data: {
          kind: 'entity_selection',
          clarification: {
            clarificationId: 'clar-wallet',
            prompt: 'Pilih wallet.',
            options: [
              { token: 'clarify_secret_a', label: 'BCA Debit', discriminator: 'BANK' },
              { token: 'clarify_secret_b', label: 'BCA Payroll', discriminator: 'BANK' },
            ],
          },
        },
      },
    });

    expect(result.terminalStatus).toBe('clarification_advanced');
    expect(result.keyboard?.rows).toHaveLength(3);
    expect(JSON.stringify(result.keyboard)).not.toContain('clarify_secret');
  });

  it('does not build Telegram buttons for guided_fields date/category clarification', async () => {
    const db = fakeDb();

    const result = await renderApplicationResult(db, 'conn-1', 'conv-1', {
      response: {
        status: 'clarification_required',
        message: 'Beberapa detail transaksi belum lengkap.',
        data: {
          kind: 'guided_fields',
          clarification: {
            kind: 'guided',
            clarificationId: 'clar-fields',
            fields: [
              { field: 'category', required: true, input: { type: 'text' } },
              { field: 'date', required: true, input: { type: 'date' } },
            ],
            expiresAt: '2026-07-29T00:15:00.000Z',
          },
        },
      },
    });

    expect(result.terminalStatus).toBe('guided_fields_handoff');
    expect(result.keyboard).toBeUndefined();
    expect((db as ReturnType<typeof fakeDb>).tokens.size).toBe(0);
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createTelegramService, type TelegramServiceDeps } from '../../src/telegram/telegram.service';

const CORRELATION_ID = 'corr-1';

function fakeDb() {
  const claimed = new Set<string>();
  return {
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    channelUpdateDedup: {
      create: vi.fn(async ({ data }: { data: { externalUpdateId: string } }) => {
        if (claimed.has(data.externalUpdateId)) {
          const err = new Error('duplicate') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        claimed.add(data.externalUpdateId);
        return {};
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  } as never;
}

function buildDeps(overrides: Partial<TelegramServiceDeps> = {}): TelegramServiceDeps {
  return {
    db: fakeDb(),
    linkTokens: { createLinkToken: vi.fn(), consumeLinkToken: vi.fn() } as never,
    connections: {
      getActiveConnection: vi.fn().mockResolvedValue(null),
      getByUser: vi.fn(),
      revoke: vi.fn(),
      setCurrentConversation: vi.fn(),
    } as never,
    client: { sendMessage: vi.fn().mockResolvedValue({ ok: true }), setWebhook: vi.fn(), deleteWebhook: vi.fn() } as never,
    ...overrides,
  };
}

const groupUpdate = { update_id: 1, message: { chat: { id: 1, type: 'group' }, from: { id: 1 }, text: 'hi' } };
const privateUpdate = (id: number, text: string, senderId = 42) => ({
  update_id: id,
  message: { chat: { id: 555, type: 'private' }, from: { id: senderId }, text },
});

describe('createTelegramService', () => {
  it('silently ignores unsupported updates (no delivery, no crash)', async () => {
    const deps = buildDeps();
    const service = createTelegramService(deps);
    await service.handleUpdate(groupUpdate, CORRELATION_ID);
    expect((deps.client.sendMessage as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('processes a duplicate update_id exactly once', async () => {
    const deps = buildDeps();
    const service = createTelegramService(deps);
    const update = privateUpdate(7, '/help');
    await service.handleUpdate(update, CORRELATION_ID);
    await service.handleUpdate(update, CORRELATION_ID);
    expect((deps.client.sendMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('/start replies with a not-linked welcome message', async () => {
    const deps = buildDeps();
    await createTelegramService(deps).handleUpdate(privateUpdate(1, '/start'), CORRELATION_ID);
    const text = (deps.client.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toContain('/link');
  });

  it('/link success calls consumeLinkToken with the identity from the update, not from message text', async () => {
    const deps = buildDeps();
    (deps.linkTokens.consumeLinkToken as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'u1', connectionId: 'c1' });
    await createTelegramService(deps).handleUpdate(privateUpdate(2, '/link secretcode123', 999), CORRELATION_ID);
    expect(deps.linkTokens.consumeLinkToken).toHaveBeenCalledWith('secretcode123', 'TELEGRAM', '999', '555');
    const text = (deps.client.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toContain('Linked!');
  });

  it('/link failure relays the safe ChannelError message without leaking which check failed', async () => {
    const deps = buildDeps();
    const { ChannelError } = await import('../../src/channels/errors');
    (deps.linkTokens.consumeLinkToken as ReturnType<typeof vi.fn>).mockRejectedValue(ChannelError.linkInvalidOrExpired());
    await createTelegramService(deps).handleUpdate(privateUpdate(3, '/link bad-token'), CORRELATION_ID);
    const text = (deps.client.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toMatch(/invalid|expired|used/i);
  });

  it('/status reports linked-since when an active connection exists', async () => {
    const deps = buildDeps();
    (deps.connections.getActiveConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', userId: 'u1', conversationId: null, status: 'ACTIVE', linkedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await createTelegramService(deps).handleUpdate(privateUpdate(4, '/status'), CORRELATION_ID);
    const text = (deps.client.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toContain('Linked since');
  });

  it('/new clears the stored conversation for a linked connection', async () => {
    const deps = buildDeps();
    (deps.connections.getActiveConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', userId: 'u1', conversationId: 'conv-1', status: 'ACTIVE', linkedAt: new Date(),
    });
    await createTelegramService(deps).handleUpdate(privateUpdate(5, '/new'), CORRELATION_ID);
    expect(deps.connections.setCurrentConversation).toHaveBeenCalledWith('c1', null);
  });

  it('/unlink revokes the connection owned by the calling identity only', async () => {
    const deps = buildDeps();
    (deps.connections.getActiveConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', userId: 'u1', conversationId: null, status: 'ACTIVE', linkedAt: new Date(),
    });
    await createTelegramService(deps).handleUpdate(privateUpdate(6, '/unlink'), CORRELATION_ID);
    expect(deps.connections.revoke).toHaveBeenCalledWith('u1', 'TELEGRAM');
  });

  it('plain text from an unlinked identity never reaches the Assistant', async () => {
    const deps = buildDeps();
    const runtime = { sendMessage: vi.fn() };
    await createTelegramService(buildDeps({ assistantProviderRuntime: runtime as never })).handleUpdate(privateUpdate(8, 'how much did I spend'), CORRELATION_ID);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('plain text with no configured Assistant provider replies with a safe unavailable message', async () => {
    const deps = buildDeps();
    (deps.connections.getActiveConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', userId: 'u1', conversationId: null, status: 'ACTIVE', linkedAt: new Date(),
    });
    await createTelegramService(deps).handleUpdate(privateUpdate(9, 'how much did I spend'), CORRELATION_ID);
    const text = (deps.client.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toMatch(/not available/i);
  });

  it('relays a plain successful Assistant reply verbatim', async () => {
    const deps = buildDeps();
    (deps.connections.getActiveConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', userId: 'u1', conversationId: null, status: 'ACTIVE', linkedAt: new Date(),
    });
    const runtime = { sendMessage: vi.fn().mockResolvedValue({ httpStatus: 200, response: { status: 'success', renderedText: 'You spent 50000.', conversationId: 'conv-9' } }) };
    await createTelegramService({ ...deps, assistantProviderRuntime: runtime as never }).handleUpdate(privateUpdate(10, 'how much did I spend'), CORRELATION_ID);
    const text = (deps.client.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toBe('You spent 50000.');
    expect(deps.connections.setCurrentConversation).toHaveBeenCalledWith('c1', 'conv-9');
  });

  it('sends a web-handoff message (never draft payload/token) when a financial draft is created', async () => {
    const deps = buildDeps();
    (deps.connections.getActiveConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', userId: 'u1', conversationId: 'conv-1', status: 'ACTIVE', linkedAt: new Date(),
    });
    const runtime = { sendMessage: vi.fn().mockResolvedValue({
      httpStatus: 200,
      response: { status: 'success', conversationId: 'conv-1', data: { draftId: 'draft-secret-1', confirmationRequired: true }, renderedText: 'Draft ready, draft-secret-1' },
    }) };
    await createTelegramService({ ...deps, assistantProviderRuntime: runtime as never }).handleUpdate(privateUpdate(11, 'spend 50000 on food'), CORRELATION_ID);
    const text = (deps.client.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toMatch(/continue in the Pocket Mint web app/i);
    expect(text).not.toContain('draft-secret-1');
  });

  it('sends a web-handoff message for clarification_required without leaking clarification data', async () => {
    const deps = buildDeps();
    (deps.connections.getActiveConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', userId: 'u1', conversationId: 'conv-1', status: 'ACTIVE', linkedAt: new Date(),
    });
    const runtime = { sendMessage: vi.fn().mockResolvedValue({
      httpStatus: 200,
      response: { status: 'clarification_required', conversationId: 'conv-1', message: 'Which wallet?', data: { options: [{ token: 'clarify_secret' }] } },
    }) };
    await createTelegramService({ ...deps, assistantProviderRuntime: runtime as never }).handleUpdate(privateUpdate(12, 'spend 50000'), CORRELATION_ID);
    const text = (deps.client.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toMatch(/continue in the Pocket Mint web app/i);
    expect(text).not.toContain('clarify_secret');
    expect(text).not.toContain('Which wallet?');
  });

  it('never logs message text, linking tokens, or the bot token', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const deps = buildDeps();
      (deps.linkTokens.consumeLinkToken as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'u1', connectionId: 'c1' });
      await createTelegramService(deps).handleUpdate(privateUpdate(13, '/link super-secret-linking-code'), CORRELATION_ID);
      const lines = [...logSpy.mock.calls, ...warnSpy.mock.calls].map((call) => call[0] as string);
      for (const line of lines) {
        expect(line).not.toContain('super-secret-linking-code');
      }
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

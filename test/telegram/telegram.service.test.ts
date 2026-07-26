import { describe, expect, it, vi } from 'vitest';
import { createTelegramService, type TelegramServiceDeps } from '../../src/telegram/telegram.service';

const CORRELATION_ID = 'corr-1';

function fakeDb() {
  const claimed = new Set<string>();
  const created: unknown[] = [];
  return {
    created,
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    channelInboundJob: {
      create: vi.fn(async ({ data }: { data: { externalUpdateId: string } & Record<string, unknown> }) => {
        if (claimed.has(data.externalUpdateId)) {
          const err = new Error('duplicate') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        claimed.add(data.externalUpdateId);
        created.push(data);
        return { id: 'job-1', ...data };
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  } as never;
}

function buildDeps(overrides: Partial<TelegramServiceDeps> = {}): TelegramServiceDeps {
  return {
    db: fakeDb(),
    connections: {
      getActiveConnection: vi.fn().mockResolvedValue(null),
      getByUser: vi.fn(),
      revoke: vi.fn(),
      setCurrentConversation: vi.fn(),
    } as never,
    ...overrides,
  };
}

const groupUpdate = { update_id: 1, message: { chat: { id: 1, type: 'group' }, from: { id: 1 }, text: 'hi' } };
const privateUpdate = (id: number, text: string, senderId = 42) => ({
  update_id: id,
  message: { chat: { id: 555, type: 'private' }, from: { id: senderId }, text },
});

describe('createTelegramService (webhook path — persist and acknowledge only)', () => {
  it('silently ignores unsupported updates (no job, no crash)', async () => {
    const deps = buildDeps();
    await createTelegramService(deps).handleUpdate(groupUpdate, CORRELATION_ID);
    expect((deps.db as ReturnType<typeof fakeDb>).channelInboundJob.create).not.toHaveBeenCalled();
  });

  it('persists a supported update as exactly one job on first delivery', async () => {
    const deps = buildDeps();
    await createTelegramService(deps).handleUpdate(privateUpdate(7, '/help'), CORRELATION_ID);
    expect((deps.db as ReturnType<typeof fakeDb>).channelInboundJob.create).toHaveBeenCalledTimes(1);
  });

  it('a retried update_id does not create a second job (dedup-by-uniqueness)', async () => {
    const deps = buildDeps();
    const service = createTelegramService(deps);
    const update = privateUpdate(8, 'how much did I spend');
    await service.handleUpdate(update, CORRELATION_ID);
    await service.handleUpdate(update, CORRELATION_ID);
    expect((deps.db as ReturnType<typeof fakeDb>).channelInboundJob.create).toHaveBeenCalledTimes(2); // called twice, second throws P2002 and is swallowed
    const created = (deps.db as ReturnType<typeof fakeDb>).created;
    expect(created).toHaveLength(1);
  });

  it('persists only the bounded extracted text, never the raw update payload', async () => {
    const deps = buildDeps();
    await createTelegramService(deps).handleUpdate(privateUpdate(9, 'spend 50000 on food'), CORRELATION_ID);
    const [data] = (deps.db as ReturnType<typeof fakeDb>).created as Array<Record<string, unknown>>;
    expect(Object.keys(data).sort()).toEqual(
      ['channelConnectionId', 'externalChatId', 'externalSenderId', 'externalUpdateId', 'provider', 'text'].sort(),
    );
    expect(data.text).toBe('spend 50000 on food');
  });

  it('associates the job with an active connection when one exists', async () => {
    const deps = buildDeps({
      connections: {
        getActiveConnection: vi.fn().mockResolvedValue({ id: 'conn-1', userId: 'u1', conversationId: null, status: 'ACTIVE', linkedAt: new Date() }),
        getByUser: vi.fn(),
        revoke: vi.fn(),
        setCurrentConversation: vi.fn(),
      } as never,
    });
    await createTelegramService(deps).handleUpdate(privateUpdate(10, 'hi'), CORRELATION_ID);
    const [data] = (deps.db as ReturnType<typeof fakeDb>).created as Array<Record<string, unknown>>;
    expect(data.channelConnectionId).toBe('conn-1');
  });

  it('leaves channelConnectionId null when no active connection exists (still durably accepted)', async () => {
    const deps = buildDeps();
    await createTelegramService(deps).handleUpdate(privateUpdate(11, '/link some-code'), CORRELATION_ID);
    const [data] = (deps.db as ReturnType<typeof fakeDb>).created as Array<Record<string, unknown>>;
    expect(data.channelConnectionId).toBeNull();
  });

  it('never logs message text or identity details', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const deps = buildDeps();
      await createTelegramService(deps).handleUpdate(privateUpdate(12, 'super-secret-linking-code'), CORRELATION_ID);
      const lines = [...logSpy.mock.calls, ...warnSpy.mock.calls].map((call) => call[0] as string);
      for (const line of lines) expect(line).not.toContain('super-secret-linking-code');
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

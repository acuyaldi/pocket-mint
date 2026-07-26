import { describe, expect, it, vi } from 'vitest';
import { processJob, type InboundWorkerDeps } from '../../../src/channels/workers/inbound.worker';
import type { ClaimedInboundJob } from '../../../src/channels/workers/claim';
import { AssistantProviderError } from '../../../src/assistant/provider-types';

function job(overrides: Partial<ClaimedInboundJob> = {}): ClaimedInboundJob {
  return {
    id: 'job-1',
    provider: 'TELEGRAM',
    externalUpdateId: '1',
    channelConnectionId: null,
    externalSenderId: 'tg-1',
    externalChatId: 'chat-1',
    text: 'how much did I spend',
    attempt: 1,
    assistantTurnId: null,
    ...overrides,
  };
}

function fakeDb() {
  const deliveries = new Map<string, { inboundJobId: string; renderedText: string }>();
  const jobUpdates: Array<Record<string, unknown>> = [];
  const operations = new Map<string, { turnId: string | null; renderedText: string | null; userId: string }>();
  return {
    deliveries,
    jobUpdates,
    operations,
    channelInboundJob: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { jobUpdates.push(data); return data; }),
    },
    channelOutboundDelivery: {
      create: vi.fn(async ({ data }: { data: { inboundJobId: string; renderedText: string } }) => {
        if (deliveries.has(data.inboundJobId)) {
          const err = new Error('duplicate') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        deliveries.set(data.inboundJobId, data);
        return data;
      }),
    },
    channelAssistantOperation: {
      create: vi.fn(async ({ data }: { data: { id: string; userId: string } }) => {
        if (operations.has(data.id)) {
          const err = new Error('duplicate') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        operations.set(data.id, { turnId: null, renderedText: null, userId: data.userId });
        return data;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, ...operations.get(where.id)! })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<{ turnId: string; renderedText: string }> }) => {
        Object.assign(operations.get(where.id)!, data);
        return data;
      }),
    },
  } as never;
}

function buildDeps(overrides: Partial<InboundWorkerDeps> = {}): InboundWorkerDeps {
  return {
    db: fakeDb(),
    connections: {
      getActiveConnection: vi.fn().mockResolvedValue(null),
      getByUser: vi.fn(),
      revoke: vi.fn(),
      setCurrentConversation: vi.fn(),
    } as never,
    linkTokens: { createLinkToken: vi.fn(), consumeLinkToken: vi.fn() } as never,
    config: { workersEnabled: true, inboundPollMs: 1, outboundPollMs: 1, batchSize: 10, leaseMs: 1000, maxAttemptsInbound: 5, maxAttemptsOutbound: 5, retentionDays: 7 },
    owner: 'test-owner',
    ...overrides,
  };
}

const linkedConnection = { id: 'conn-1', userId: 'user-1', conversationId: null, status: 'ACTIVE' as const, linkedAt: new Date() };

describe('processJob — commands', () => {
  it('processes a command deterministically and marks the job succeeded', async () => {
    const deps = buildDeps();
    await processJob(deps, job({ text: '/help' }), 'corr-1');
    const db = deps.db as ReturnType<typeof fakeDb>;
    expect(db.deliveries.get('job-1')?.renderedText).toMatch(/Available commands/);
    expect(db.jobUpdates.at(-1)).toMatchObject({ status: 'SUCCEEDED' });
  });
});

describe('processJob — plain text', () => {
  it('replies not-linked and succeeds without ever touching the Assistant when unlinked', async () => {
    const runtime = { sendMessage: vi.fn() };
    const deps = buildDeps({ assistantProviderRuntime: runtime as never });
    await processJob(deps, job(), 'corr-1');
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    const db = deps.db as ReturnType<typeof fakeDb>;
    expect(db.deliveries.get('job-1')?.renderedText).toMatch(/not linked/i);
    expect(db.jobUpdates.at(-1)).toMatchObject({ status: 'SUCCEEDED' });
  });

  it('replies unavailable when no Assistant provider is configured', async () => {
    const deps = buildDeps({
      connections: { getActiveConnection: vi.fn().mockResolvedValue(linkedConnection), getByUser: vi.fn(), revoke: vi.fn(), setCurrentConversation: vi.fn() } as never,
    });
    await processJob(deps, job(), 'corr-1');
    const db = deps.db as ReturnType<typeof fakeDb>;
    expect(db.deliveries.get('job-1')?.renderedText).toMatch(/not available/i);
  });

  it('calls the Assistant exactly once, binds the turn, and creates one outbound delivery', async () => {
    const runtime = { sendMessage: vi.fn().mockResolvedValue({ httpStatus: 200, response: { status: 'success', renderedText: 'You spent 50000.', conversationId: 'conv-1', turnId: 'turn-1' } }) };
    const deps = buildDeps({
      connections: { getActiveConnection: vi.fn().mockResolvedValue(linkedConnection), getByUser: vi.fn(), revoke: vi.fn(), setCurrentConversation: vi.fn() } as never,
      assistantProviderRuntime: runtime as never,
    });
    await processJob(deps, job(), 'corr-1');
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    const db = deps.db as ReturnType<typeof fakeDb>;
    expect(db.deliveries.get('job-1')?.renderedText).toBe('You spent 50000.');
    expect(db.jobUpdates).toContainEqual(expect.objectContaining({ assistantTurnId: 'turn-1' }));
    expect(db.jobUpdates.at(-1)).toMatchObject({ status: 'SUCCEEDED' });
  });

  it('crash-window C: a reclaimed job whose operation already recorded a turn does not call the Assistant again', async () => {
    const db = fakeDb();
    db.operations.set('channel:telegram:job-1', { turnId: 'turn-1', renderedText: 'You spent 50000.', userId: 'user-1' });
    const runtime = { sendMessage: vi.fn() };
    const deps = buildDeps({
      db: db as never,
      connections: { getActiveConnection: vi.fn().mockResolvedValue(linkedConnection), getByUser: vi.fn(), revoke: vi.fn(), setCurrentConversation: vi.fn() } as never,
      assistantProviderRuntime: runtime as never,
    });
    await processJob(deps, job({ attempt: 2 }), 'corr-1');
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(db.deliveries.get('job-1')?.renderedText).toBe('You spent 50000.');
    expect(db.jobUpdates.at(-1)).toMatchObject({ status: 'SUCCEEDED' });
  });

  it('a prior attempt that crashed before recording a turn fails the job terminally instead of risking a duplicate financial mutation', async () => {
    const db = fakeDb();
    db.operations.set('channel:telegram:job-1', { turnId: null, renderedText: null, userId: 'user-1' });
    const runtime = { sendMessage: vi.fn() };
    const deps = buildDeps({
      db: db as never,
      connections: { getActiveConnection: vi.fn().mockResolvedValue(linkedConnection), getByUser: vi.fn(), revoke: vi.fn(), setCurrentConversation: vi.fn() } as never,
      assistantProviderRuntime: runtime as never,
    });
    await processJob(deps, job({ attempt: 2 }), 'corr-1');
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(db.jobUpdates.at(-1)).toMatchObject({ status: 'FAILED_TERMINAL', errorCategory: 'ambiguous_assistant_execution' });
    expect(db.deliveries.has('job-1')).toBe(false);
  });

  it('a retryable Assistant failure schedules a retry instead of terminal failure', async () => {
    const runtime = { sendMessage: vi.fn().mockRejectedValue(AssistantProviderError.unavailable()) };
    const deps = buildDeps({
      connections: { getActiveConnection: vi.fn().mockResolvedValue(linkedConnection), getByUser: vi.fn(), revoke: vi.fn(), setCurrentConversation: vi.fn() } as never,
      assistantProviderRuntime: runtime as never,
    });
    await processJob(deps, job({ attempt: 1 }), 'corr-1');
    const db = deps.db as ReturnType<typeof fakeDb>;
    expect(db.jobUpdates.at(-1)).toMatchObject({ status: 'FAILED_RETRYABLE' });
  });

  it('a retryable failure past max attempts becomes terminal', async () => {
    const runtime = { sendMessage: vi.fn().mockRejectedValue(AssistantProviderError.unavailable()) };
    const deps = buildDeps({
      connections: { getActiveConnection: vi.fn().mockResolvedValue(linkedConnection), getByUser: vi.fn(), revoke: vi.fn(), setCurrentConversation: vi.fn() } as never,
      assistantProviderRuntime: runtime as never,
    });
    await processJob(deps, job({ attempt: 5 }), 'corr-1');
    const db = deps.db as ReturnType<typeof fakeDb>;
    expect(db.jobUpdates.at(-1)).toMatchObject({ status: 'FAILED_TERMINAL' });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { beginAssistantOperation, channelOperationId, completeAssistantOperation } from '../../../src/channels/workers/assistantOperationGuard';

function fakeDb() {
  const rows = new Map<string, { id: string; userId: string; turnId: string | null; renderedText: string | null }>();
  return {
    rows,
    channelAssistantOperation: {
      create: vi.fn(async ({ data }: { data: { id: string; userId: string } }) => {
        if (rows.has(data.id)) {
          const err = new Error('duplicate') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        rows.set(data.id, { id: data.id, userId: data.userId, turnId: null, renderedText: null });
        return rows.get(data.id);
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id)!),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<{ turnId: string; renderedText: string }> }) => {
        const row = rows.get(where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  } as never;
}

describe('channelOperationId', () => {
  it('derives a stable, lowercase-provider operation key from the job id', () => {
    expect(channelOperationId('TELEGRAM', 'job-1')).toBe('channel:telegram:job-1');
  });
});

describe('beginAssistantOperation / completeAssistantOperation', () => {
  it('returns "new" on first insert', async () => {
    const db = fakeDb();
    const result = await beginAssistantOperation(db, 'channel:telegram:job-1', 'user-1');
    expect(result.status).toBe('new');
  });

  it('returns "replay" with the persisted turn/text once bound (crash-window C: no second Assistant call)', async () => {
    const db = fakeDb();
    await beginAssistantOperation(db, 'channel:telegram:job-1', 'user-1');
    await completeAssistantOperation(db, 'channel:telegram:job-1', 'turn-1', 'You spent 50000.');
    const result = await beginAssistantOperation(db, 'channel:telegram:job-1', 'user-1');
    expect(result).toEqual({ status: 'replay', turnId: 'turn-1', renderedText: 'You spent 50000.' });
  });

  it('returns "ambiguous" when a prior attempt started but never recorded a turn (crashed mid-call)', async () => {
    const db = fakeDb();
    await beginAssistantOperation(db, 'channel:telegram:job-1', 'user-1');
    const result = await beginAssistantOperation(db, 'channel:telegram:job-1', 'user-1');
    expect(result).toEqual({ status: 'ambiguous' });
  });
});

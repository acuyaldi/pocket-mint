import { describe, expect, it, vi } from 'vitest';
import { createChannelConnectionService } from '../../src/channels/connection.service';

function fakeDb(row: unknown) {
  return {
    channelConnection: {
      findUnique: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
  } as never;
}

describe('createChannelConnectionService', () => {
  it('getActiveConnection returns null for a revoked connection (never treated as active)', async () => {
    const db = fakeDb({ id: 'c1', userId: 'u1', conversationId: null, status: 'REVOKED', linkedAt: new Date() });
    const service = createChannelConnectionService(db);
    expect(await service.getActiveConnection('TELEGRAM', 'tg-1')).toBeNull();
  });

  it('getActiveConnection returns null when no connection exists', async () => {
    const db = fakeDb(null);
    expect(await createChannelConnectionService(db).getActiveConnection('TELEGRAM', 'tg-1')).toBeNull();
  });

  it('getActiveConnection returns the summary for an active connection', async () => {
    const linkedAt = new Date();
    const db = fakeDb({ id: 'c1', userId: 'u1', conversationId: 'conv-1', status: 'ACTIVE', linkedAt });
    expect(await createChannelConnectionService(db).getActiveConnection('TELEGRAM', 'tg-1')).toEqual({
      id: 'c1', userId: 'u1', conversationId: 'conv-1', status: 'ACTIVE', linkedAt,
    });
  });

  it('revoke is scoped to (userId, provider, status ACTIVE) — idempotent no-op when already revoked', async () => {
    const db = fakeDb(null);
    await createChannelConnectionService(db).revoke('u1', 'TELEGRAM');
    expect((db as unknown as { channelConnection: { updateMany: ReturnType<typeof vi.fn> } }).channelConnection.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', provider: 'TELEGRAM', status: 'ACTIVE' },
      data: expect.objectContaining({ status: 'REVOKED' }),
    });
  });
});

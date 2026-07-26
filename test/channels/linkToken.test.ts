import { describe, expect, it, vi } from 'vitest';
import { createChannelLinkTokenService } from '../../src/channels/linkToken.service';
import { ChannelError } from '../../src/channels/errors';

function fakeDb(overrides: {
  updateManyCount?: number;
  storedRecord?: { userId: string; tokenDigest: string };
  existingByIdentity?: { userId: string } | null;
  upsertResult?: { id: string };
} = {}) {
  const created: Array<{ userId: string; provider: string; tokenDigest: string; expiresAt: Date }> = [];
  const tx = {
    channelLinkToken: {
      updateMany: vi.fn().mockResolvedValue({ count: overrides.updateManyCount ?? 1 }),
      findFirstOrThrow: vi.fn().mockResolvedValue(overrides.storedRecord ?? { userId: 'user-1', tokenDigest: 'x' }),
    },
    channelConnection: {
      findUnique: vi.fn().mockResolvedValue(overrides.existingByIdentity ?? null),
      upsert: vi.fn().mockResolvedValue(overrides.upsertResult ?? { id: 'conn-1' }),
    },
  };
  return {
    channelLinkToken: { create: vi.fn(async ({ data }: { data: typeof created[number] }) => { created.push(data); return { id: 'token-1', ...data }; }) },
    $transaction: vi.fn(async (work: (tx: typeof tx) => unknown) => work(tx)),
    __tx: tx,
    __created: created,
  } as never;
}

describe('createChannelLinkTokenService', () => {
  it('creates a digest-only token, never persisting the raw value', async () => {
    const db = fakeDb();
    const service = createChannelLinkTokenService(db);
    const { token, expiresAt } = await service.createLinkToken('user-1', 'TELEGRAM');
    expect(token).toMatch(/^[\w-]{20,}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const stored = (db as unknown as { __created: Array<{ tokenDigest: string }> }).__created[0];
    expect(stored.tokenDigest).not.toBe(token);
    expect(stored.tokenDigest).toMatch(/^[0-9a-f]{64}$/); // sha256 hex digest
  });

  it('binds a valid token to a new connection for the token-owning user', async () => {
    const db = fakeDb({ updateManyCount: 1, storedRecord: { userId: 'user-1', tokenDigest: 'x' } });
    const service = createChannelLinkTokenService(db);
    const result = await service.consumeLinkToken('raw-token', 'TELEGRAM', 'tg-999', 'chat-555');
    expect(result).toEqual({ userId: 'user-1', connectionId: 'conn-1' });
    const tx = (db as unknown as { __tx: { channelConnection: { upsert: ReturnType<typeof vi.fn> } } }).__tx;
    expect(tx.channelConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_provider: { userId: 'user-1', provider: 'TELEGRAM' } },
    }));
  });

  it('rejects an invalid/expired/already-used token with one indistinguishable error', async () => {
    const db = fakeDb({ updateManyCount: 0 });
    const service = createChannelLinkTokenService(db);
    await expect(service.consumeLinkToken('bad', 'TELEGRAM', 'tg-1', 'chat-1')).rejects.toMatchObject({ code: 'CHANNEL_LINK_INVALID' });
  });

  it('rejects binding an identity already linked to a different Pocket Mint user (no implicit transfer)', async () => {
    const db = fakeDb({ updateManyCount: 1, storedRecord: { userId: 'user-1', tokenDigest: 'x' }, existingByIdentity: { userId: 'user-2' } });
    const service = createChannelLinkTokenService(db);
    await expect(service.consumeLinkToken('raw', 'TELEGRAM', 'tg-shared', 'chat-1')).rejects.toBeInstanceOf(ChannelError);
    const tx = (db as unknown as { __tx: { channelConnection: { upsert: ReturnType<typeof vi.fn> } } }).__tx;
    expect(tx.channelConnection.upsert).not.toHaveBeenCalled();
  });
});

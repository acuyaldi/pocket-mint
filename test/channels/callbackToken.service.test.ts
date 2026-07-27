import { describe, expect, it } from 'vitest';
import {
  createCallbackToken,
  findCallbackTokenByRaw,
  claimCallbackToken,
  expireCallbackToken,
  staleCallbackToken,
} from '../../src/channels/callbackToken.service';

interface Row {
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
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function fakeDb() {
  const rows = new Map<string, Row>();
  let seq = 0;
  return {
    rows,
    channelCallbackToken: {
      create: async ({ data }: { data: Partial<Row> }) => {
        const id = `token-${++seq}`;
        const row: Row = {
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
          consumedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        rows.set(id, row);
        return row;
      },
      findUnique: async ({ where }: { where: { provider_tokenDigest?: { provider: string; tokenDigest: string }; id?: string } }) => {
        if (where.id) return rows.get(where.id) ?? null;
        for (const row of rows.values()) {
          if (row.provider === where.provider_tokenDigest!.provider && row.tokenDigest === where.provider_tokenDigest!.tokenDigest) return row;
        }
        return null;
      },
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Partial<Row> }) => {
        const row = rows.get(where.id);
        if (!row || row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  } as never;
}

describe('callbackToken.service', () => {
  it('returns a plaintext token distinct from what is persisted (digest-only storage)', async () => {
    const db = fakeDb();
    const { id, token } = await createCallbackToken(db, {
      connectionId: 'conn-1',
      conversationId: 'conv-1',
      interactionType: 'DRAFT_CONFIRM',
      financialDraftId: 'draft-1',
    });
    const row = (db as ReturnType<typeof fakeDb>).rows.get(id)!;
    expect(row.tokenDigest).not.toBe(token);
    expect(row.tokenDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('resolves a token by its raw plaintext via digest lookup', async () => {
    const db = fakeDb();
    const { token } = await createCallbackToken(db, { connectionId: 'conn-1', conversationId: 'conv-1', interactionType: 'DRAFT_CANCEL', financialDraftId: 'draft-1' });
    const found = await findCallbackTokenByRaw(db, token);
    expect(found).not.toBeNull();
    expect(found!.financialDraftId).toBe('draft-1');
  });

  it('returns null for an unknown token (no such digest)', async () => {
    const db = fakeDb();
    expect(await findCallbackTokenByRaw(db, 'cbk_does-not-exist')).toBeNull();
  });

  it('claims a PENDING token exactly once — a second claim on the same id fails', async () => {
    const db = fakeDb();
    const { id } = await createCallbackToken(db, { connectionId: 'c', conversationId: 'v', interactionType: 'DRAFT_CONFIRM', financialDraftId: 'd' });
    expect(await claimCallbackToken(db, id)).toBe(true);
    expect(await claimCallbackToken(db, id)).toBe(false);
    const row = (db as ReturnType<typeof fakeDb>).rows.get(id)!;
    expect(row.status).toBe('CONSUMED');
    expect(row.actionSecret).toBeNull();
  });

  it('clears actionSecret on claim (defense in depth after consumption)', async () => {
    const db = fakeDb();
    const { id } = await createCallbackToken(db, { connectionId: 'c', conversationId: 'v', interactionType: 'CLARIFICATION_SELECT', clarificationRequestId: 'cr-1', actionSecret: 'clarify_raw-token' });
    await claimCallbackToken(db, id);
    expect((db as ReturnType<typeof fakeDb>).rows.get(id)!.actionSecret).toBeNull();
  });

  it('expireCallbackToken only transitions a still-PENDING row (idempotent)', async () => {
    const db = fakeDb();
    const { id } = await createCallbackToken(db, { connectionId: 'c', conversationId: 'v', interactionType: 'DRAFT_CONFIRM', financialDraftId: 'd' });
    await claimCallbackToken(db, id); // now CONSUMED
    await expireCallbackToken(db, id);
    expect((db as ReturnType<typeof fakeDb>).rows.get(id)!.status).toBe('CONSUMED'); // unchanged — already terminal
  });

  it('staleCallbackToken transitions a PENDING row to STALE', async () => {
    const db = fakeDb();
    const { id } = await createCallbackToken(db, { connectionId: 'c', conversationId: 'v', interactionType: 'DRAFT_CANCEL', financialDraftId: 'd' });
    await staleCallbackToken(db, id);
    expect((db as ReturnType<typeof fakeDb>).rows.get(id)!.status).toBe('STALE');
  });
});

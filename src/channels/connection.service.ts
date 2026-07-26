import type { PrismaClient } from '../generated/prisma/client';
import type { ChannelProviderName } from './types';

export interface ChannelConnectionSummary {
  readonly id: string;
  readonly userId: string;
  readonly conversationId: string | null;
  readonly status: 'ACTIVE' | 'REVOKED';
  readonly linkedAt: Date;
}

export function createChannelConnectionService(db: PrismaClient) {
  /** Resolves an external identity to its active connection, or null if unlinked/revoked. */
  async function getActiveConnection(
    provider: ChannelProviderName,
    externalUserId: string,
  ): Promise<ChannelConnectionSummary | null> {
    const row = await db.channelConnection.findUnique({ where: { provider_externalUserId: { provider, externalUserId } } });
    if (!row || row.status !== 'ACTIVE') return null;
    return { id: row.id, userId: row.userId, conversationId: row.conversationId, status: row.status, linkedAt: row.linkedAt };
  }

  async function getByUser(userId: string, provider: ChannelProviderName): Promise<ChannelConnectionSummary | null> {
    const row = await db.channelConnection.findUnique({ where: { userId_provider: { userId, provider } } });
    if (!row) return null;
    return { id: row.id, userId: row.userId, conversationId: row.conversationId, status: row.status, linkedAt: row.linkedAt };
  }

  /** Idempotent: revoking an already-revoked or nonexistent connection is a no-op. */
  async function revoke(userId: string, provider: ChannelProviderName): Promise<void> {
    await db.channelConnection.updateMany({
      where: { userId, provider, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  async function setCurrentConversation(connectionId: string, conversationId: string | null): Promise<void> {
    await db.channelConnection.update({ where: { id: connectionId }, data: { conversationId } });
  }

  return { getActiveConnection, getByUser, revoke, setCurrentConversation };
}

export type ChannelConnectionService = ReturnType<typeof createChannelConnectionService>;

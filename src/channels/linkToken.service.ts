import { randomBytes, createHash } from 'crypto';
import type { PrismaClient } from '../generated/prisma/client';
import type { ChannelProviderName } from './types';
import { ChannelError } from './errors';

export const CHANNEL_LINK_TOKEN_TTL_MS = 10 * 60 * 1000;

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createChannelLinkTokenService(db: PrismaClient, clock: () => Date = () => new Date()) {
  /** Mints a one-time linking code for the authenticated user. Raw value returned once, never persisted. */
  async function createLinkToken(userId: string, provider: ChannelProviderName): Promise<{ token: string; expiresAt: Date }> {
    const token = generateToken();
    const expiresAt = new Date(clock().getTime() + CHANNEL_LINK_TOKEN_TTL_MS);
    await db.channelLinkToken.create({
      data: { userId, provider, tokenDigest: digest(token), expiresAt },
    });
    return { token, expiresAt };
  }

  /**
   * Atomically claims a linking code and binds the external identity to the
   * owning user's ChannelConnection. Invalid/expired/already-used tokens all
   * throw the same error — deliberately indistinguishable to the caller.
   * Never transfers an identity already bound to a different user.
   */
  async function consumeLinkToken(
    rawToken: string,
    provider: ChannelProviderName,
    externalUserId: string,
    externalChatId: string,
  ): Promise<{ userId: string; connectionId: string }> {
    const tokenDigest = digest(rawToken);
    const now = clock();
    return db.$transaction(async (tx) => {
      const claimed = await tx.channelLinkToken.updateMany({
        where: { provider, tokenDigest, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1) throw ChannelError.linkInvalidOrExpired();
      const record = await tx.channelLinkToken.findFirstOrThrow({ where: { provider, tokenDigest } });

      const existingByIdentity = await tx.channelConnection.findUnique({
        where: { provider_externalUserId: { provider, externalUserId } },
      });
      if (existingByIdentity && existingByIdentity.userId !== record.userId) {
        throw ChannelError.linkIdentityConflict();
      }

      const connection = await tx.channelConnection.upsert({
        where: { userId_provider: { userId: record.userId, provider } },
        create: { userId: record.userId, provider, externalUserId, externalChatId, status: 'ACTIVE' },
        update: { externalUserId, externalChatId, status: 'ACTIVE', revokedAt: null },
      });
      return { userId: record.userId, connectionId: connection.id };
    });
  }

  return { createLinkToken, consumeLinkToken };
}

export type ChannelLinkTokenService = ReturnType<typeof createChannelLinkTokenService>;

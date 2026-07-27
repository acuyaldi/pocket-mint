// ============================================================
// ChannelCallbackToken — opaque inline-keyboard button handles.
// ------------------------------------------------------------
// Mirrors ClarificationOption.tokenDigest (Phase 24): the raw token is
// returned to the caller exactly once (to embed in Telegram callback_data)
// and never persisted — only its digest is stored. `actionSecret` is a
// separate, server-side-only field (never sent to Telegram) that wraps
// whatever material the authoritative service needs to complete the action
// (currently: the raw ClarificationOption token for CLARIFICATION_SELECT).
// ============================================================

import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client';

const TOKEN_PREFIX = 'cbk_';
const TOKEN_BYTES = 24;
export const CALLBACK_TOKEN_TTL_MS = 15 * 60 * 1000;

export type ChannelCallbackInteractionType =
  | 'CLARIFICATION_SELECT'
  | 'CLARIFICATION_CANCEL'
  | 'DRAFT_CONFIRM'
  | 'DRAFT_CANCEL';

export interface CreateCallbackTokenInput {
  readonly connectionId: string;
  readonly conversationId: string;
  readonly interactionType: ChannelCallbackInteractionType;
  readonly clarificationRequestId?: string;
  readonly clarificationOptionId?: string;
  readonly financialDraftId?: string;
  /** Server-side-only; never returned alongside the plaintext token. */
  readonly actionSecret?: string;
}

function digestCallbackToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateCallbackToken(): string {
  return TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Creates a token row and returns its plaintext once — the only value that ever goes into Telegram callback_data. */
export async function createCallbackToken(
  db: PrismaClient,
  input: CreateCallbackTokenInput,
): Promise<{ id: string; token: string }> {
  const token = generateCallbackToken();
  const row = await db.channelCallbackToken.create({
    data: {
      provider: 'TELEGRAM',
      tokenDigest: digestCallbackToken(token),
      connectionId: input.connectionId,
      conversationId: input.conversationId,
      interactionType: input.interactionType,
      clarificationRequestId: input.clarificationRequestId ?? null,
      clarificationOptionId: input.clarificationOptionId ?? null,
      financialDraftId: input.financialDraftId ?? null,
      actionSecret: input.actionSecret ?? null,
      expiresAt: new Date(Date.now() + CALLBACK_TOKEN_TTL_MS),
    },
  });
  return { id: row.id, token };
}

/** Digest lookup only — the raw callback_data handle is never trusted as anything but a lookup key. */
export function findCallbackTokenByRaw(db: PrismaClient, rawToken: string) {
  return db.channelCallbackToken.findUnique({
    where: { provider_tokenDigest: { provider: 'TELEGRAM', tokenDigest: digestCallbackToken(rawToken) } },
  });
}

/**
 * Atomic one-time claim — the actual concurrency guard between two
 * independent button presses on the same token (mirrors ClarificationRequest's
 * PENDING->CONSUMED conditional update). Clears `actionSecret` on success.
 */
export async function claimCallbackToken(db: PrismaClient, id: string): Promise<boolean> {
  const claimed = await db.channelCallbackToken.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'CONSUMED', consumedAt: new Date(), actionSecret: null },
  });
  return claimed.count === 1;
}

/** Lazy terminalization on read, mirroring ClarificationRequest's expiry-on-read pattern. */
export async function expireCallbackToken(db: PrismaClient, id: string): Promise<void> {
  await db.channelCallbackToken.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'EXPIRED', actionSecret: null } });
}

export async function staleCallbackToken(db: PrismaClient, id: string): Promise<void> {
  await db.channelCallbackToken.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'STALE', actionSecret: null } });
}

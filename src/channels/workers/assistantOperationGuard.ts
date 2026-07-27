import type { PrismaClient } from '../../generated/prisma/client';

export type OperationBeginResult =
  | { readonly status: 'new' }
  | { readonly status: 'replay'; readonly turnId: string; readonly renderedText: string }
  /** A prior attempt on this exact job started but crashed before recording a turn — cannot safely tell whether the Assistant (and any financial mutation) actually ran. Fails safe: caller must not retry the Assistant call. */
  | { readonly status: 'ambiguous' };

export function channelOperationId(provider: string, inboundJobId: string): string {
  return `channel:${provider.toLowerCase()}:${inboundJobId}`;
}

/**
 * Operation-identity guard binding one inbound job to at most one Assistant
 * turn (see docs/product/decisions/015 — the Assistant module itself has no
 * request-level idempotency contract, so this lives entirely in the channel
 * layer instead of touching it). Insert-first-wins: a conflict means a
 * previous attempt on this exact job already started.
 */
export async function beginAssistantOperation(
  db: PrismaClient,
  operationId: string,
  userId: string,
): Promise<OperationBeginResult> {
  try {
    await db.channelAssistantOperation.create({ data: { id: operationId, userId } });
    return { status: 'new' };
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error;
    const existing = await db.channelAssistantOperation.findUniqueOrThrow({ where: { id: operationId } });
    return existing.turnId && existing.renderedText
      ? { status: 'replay', turnId: existing.turnId, renderedText: existing.renderedText }
      : { status: 'ambiguous' };
  }
}

export async function completeAssistantOperation(
  db: PrismaClient,
  operationId: string,
  turnId: string,
  renderedText: string,
): Promise<void> {
  await db.channelAssistantOperation.update({ where: { id: operationId }, data: { turnId, renderedText } });
}

export type CallbackOperationBeginResult =
  | { readonly status: 'new' }
  | { readonly status: 'replay'; readonly terminalStatus: string; readonly renderedText: string }
  /** A prior attempt crashed before recording a terminal result — fails safe: caller must not repeat the callback action. */
  | { readonly status: 'ambiguous' };

/**
 * Same insert-first-wins operation-identity guard as `beginAssistantOperation`,
 * but for a CALLBACK_INTERACTION — never an Assistant turn. One inbound
 * callback job maps to at most one interaction operation.
 */
export async function beginCallbackOperation(
  db: PrismaClient,
  operationId: string,
  userId: string,
  callbackTokenId: string | null,
): Promise<CallbackOperationBeginResult> {
  try {
    await db.channelAssistantOperation.create({ data: { id: operationId, userId, kind: 'CALLBACK_INTERACTION', callbackTokenId } });
    return { status: 'new' };
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error;
    const existing = await db.channelAssistantOperation.findUniqueOrThrow({ where: { id: operationId } });
    return existing.terminalStatus && existing.renderedText
      ? { status: 'replay', terminalStatus: existing.terminalStatus, renderedText: existing.renderedText }
      : { status: 'ambiguous' };
  }
}

export async function completeCallbackOperation(
  db: PrismaClient,
  operationId: string,
  terminalStatus: string,
  renderedText: string,
): Promise<void> {
  await db.channelAssistantOperation.update({ where: { id: operationId }, data: { terminalStatus, renderedText } });
}

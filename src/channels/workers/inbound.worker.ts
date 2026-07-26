import type { PrismaClient } from '../../generated/prisma/client';
import type { ChannelConnectionService } from '../connection.service';
import type { ChannelLinkTokenService } from '../linkToken.service';
import type { AssistantProviderRuntime } from '../../assistant/provider-runtime';
import { parseTelegramCommand } from '../../telegram/commands';
import { handleTelegramCommand } from '../../telegram/commandHandler';
import { renderAssistantReply, truncateOutbound } from '../../telegram/replyRenderer';
import { categorizeError } from '../../utils/errorCategory';
import { logEvent, startTimer } from '../../utils/logger';
import { claimInboundJobs, type ClaimedInboundJob } from './claim';
import { beginAssistantOperation, channelOperationId, completeAssistantOperation } from './assistantOperationGuard';
import { decideRetry } from './retry';
import { cleanupChannelRecords } from '../retention';
import type { ChannelWorkerConfig } from '../workerConfig';

export interface InboundWorkerDeps {
  readonly db: PrismaClient;
  readonly connections: ChannelConnectionService;
  readonly linkTokens: ChannelLinkTokenService;
  readonly assistantProviderRuntime?: AssistantProviderRuntime;
  readonly config: ChannelWorkerConfig;
  readonly owner: string;
}

const PROVIDER_UNAVAILABLE_MESSAGE = 'The Assistant is not available right now. Please try again later.';

async function markSucceeded(db: PrismaClient, jobId: string): Promise<void> {
  await db.channelInboundJob.update({
    where: { id: jobId },
    data: { status: 'SUCCEEDED', completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
  });
}

async function markFailed(
  db: PrismaClient,
  job: ClaimedInboundJob,
  category: ReturnType<typeof categorizeError>,
  maxAttempts: number,
  backoff: { baseMs: number; maxMs: number },
): Promise<'retry' | 'terminal'> {
  const decision = decideRetry(category, job.attempt, maxAttempts, backoff);
  await db.channelInboundJob.update({
    where: { id: job.id },
    data: decision.outcome === 'retry'
      ? { status: 'FAILED_RETRYABLE', availableAt: decision.availableAt, leaseOwner: null, leaseExpiresAt: null, errorCategory: category }
      : { status: 'FAILED_TERMINAL', completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, errorCategory: category },
  });
  return decision.outcome;
}

/** Creates the single outbound delivery for a job, idempotent against a reclaim after the row already exists. */
async function ensureOutboundDelivery(db: PrismaClient, job: ClaimedInboundJob, text: string): Promise<void> {
  try {
    await db.channelOutboundDelivery.create({
      data: {
        inboundJobId: job.id,
        provider: job.provider as 'TELEGRAM',
        destinationChatId: job.externalChatId,
        renderedText: truncateOutbound(text),
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error;
    // Delivery already created by a previous attempt on this job — reclaim-safe no-op.
  }
}

/** Exported for direct unit testing — pollOnce composes this with the raw-SQL claim step. */
export async function processJob(deps: InboundWorkerDeps, job: ClaimedInboundJob, correlationId: string): Promise<void> {
  const backoff = { baseMs: 1000, maxMs: 60_000 };
  try {
    const command = parseTelegramCommand(job.text);

    if (command) {
      const reply = await handleTelegramCommand(
        { linkTokens: deps.linkTokens, connections: deps.connections },
        command,
        job.externalSenderId,
        job.externalChatId,
      );
      await ensureOutboundDelivery(deps.db, job, reply);
      await markSucceeded(deps.db, job.id);
      logEvent('info', { event: 'channel.inbound.completed', requestId: correlationId, provider: 'telegram', attempt: job.attempt });
      return;
    }

    const activeConnection = await deps.connections.getActiveConnection('TELEGRAM', job.externalSenderId);
    if (!activeConnection) {
      const reply = 'Your Telegram account is not linked yet. Open Pocket Mint on the web, generate a linking code, then send /link <code> here.';
      await ensureOutboundDelivery(deps.db, job, reply);
      await markSucceeded(deps.db, job.id);
      return;
    }

    if (!deps.assistantProviderRuntime) {
      await ensureOutboundDelivery(deps.db, job, PROVIDER_UNAVAILABLE_MESSAGE);
      await markSucceeded(deps.db, job.id);
      return;
    }

    const operationId = channelOperationId(job.provider, job.id);
    const guard = await beginAssistantOperation(deps.db, operationId, activeConnection.userId);

    if (guard.status === 'ambiguous') {
      await deps.db.channelInboundJob.update({
        where: { id: job.id },
        data: { status: 'FAILED_TERMINAL', completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, errorCategory: 'ambiguous_assistant_execution' },
      });
      logEvent('warn', { event: 'channel.inbound.failed', requestId: correlationId, provider: 'telegram', errorCategory: 'internal', retryable: false });
      return;
    }

    let turnId: string;
    let replyText: string;

    if (guard.status === 'replay') {
      // A prior attempt on this job already completed the Assistant call and
      // recorded the rendered reply — reuse it verbatim, never call the
      // Assistant again for this job (crash-window C).
      turnId = guard.turnId;
      replyText = guard.renderedText;
    } else {
      const elapsed = startTimer();
      logEvent('info', { event: 'channel.assistant.started', requestId: correlationId, provider: 'telegram' });
      const result = await deps.assistantProviderRuntime.sendMessage(activeConnection.userId, correlationId, {
        message: job.text,
        ...(activeConnection.conversationId ? { conversationId: activeConnection.conversationId } : {}),
      });
      logEvent('info', {
        event: 'channel.assistant.completed',
        requestId: correlationId,
        provider: 'telegram',
        durationMs: elapsed(),
        outcome: result.response.status,
      });

      const responseConversationId = (result.response as { conversationId?: string }).conversationId;
      if (responseConversationId && responseConversationId !== activeConnection.conversationId) {
        await deps.connections.setCurrentConversation(activeConnection.id, responseConversationId);
      }

      turnId = (result.response as { turnId: string }).turnId;
      replyText = renderAssistantReply(result.response);
      await completeAssistantOperation(deps.db, operationId, turnId, replyText);
    }

    await deps.db.channelInboundJob.update({ where: { id: job.id }, data: { assistantTurnId: turnId } });
    await ensureOutboundDelivery(deps.db, job, replyText);
    await markSucceeded(deps.db, job.id);
    logEvent('info', { event: 'channel.inbound.completed', requestId: correlationId, provider: 'telegram', attempt: job.attempt });
  } catch (error) {
    const category = categorizeError(error);
    logEvent('warn', { event: 'channel.assistant.failed', requestId: correlationId, provider: 'telegram', errorCategory: category });
    const outcome = await markFailed(deps.db, job, category, deps.config.maxAttemptsInbound, backoff);
    logEvent(outcome === 'retry' ? 'info' : 'warn', {
      event: outcome === 'retry' ? 'channel.inbound.retry_scheduled' : 'channel.inbound.failed',
      requestId: correlationId,
      provider: 'telegram',
      attempt: job.attempt,
      errorCategory: category,
      retryable: outcome === 'retry',
    });
  }
}

export function createInboundWorker(deps: InboundWorkerDeps) {
  async function pollOnce(): Promise<number> {
    const jobs = await claimInboundJobs(deps.db, { batchSize: deps.config.batchSize, leaseMs: deps.config.leaseMs, owner: deps.owner });
    for (const job of jobs) {
      if (job.attempt > 1) {
        logEvent('info', { event: 'channel.inbound.claimed', requestId: job.id, provider: 'telegram', attempt: job.attempt, leaseRecovered: true });
      }
      await processJob(deps, job, job.id);
    }
    if (jobs.length > 0) {
      await cleanupChannelRecords(deps.db, deps.config.retentionDays).catch(() => undefined);
    }
    return jobs.length;
  }

  return { pollOnce };
}

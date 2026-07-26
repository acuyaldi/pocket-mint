import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createPrismaResources } from '../../src/lib/prismaFactory';
import { assertTestDatabaseUrl } from '../../src/lib/assertTestDatabaseUrl';
import { createChannelLinkTokenService } from '../../src/channels/linkToken.service';
import { createChannelConnectionService } from '../../src/channels/connection.service';
import { createInboundJob } from '../../src/channels/inboundJob.service';
import { claimInboundJobs, claimOutboundDeliveries } from '../../src/channels/workers/claim';
import { processJob, type InboundWorkerDeps } from '../../src/channels/workers/inbound.worker';
import { processDelivery, type OutboundWorkerDeps } from '../../src/channels/workers/outbound.worker';
import { cleanupChannelRecords } from '../../src/channels/retention';

const url = process.env.TEST_DATABASE_URL;
if (url) assertTestDatabaseUrl(url);
const resources = url ? createPrismaResources(url, { max: 12 }) : undefined;
const users: string[] = [];
afterAll(() => resources?.close());
afterEach(async () => { if (resources && users.length) await resources.prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } }); });

const CONFIG = { workersEnabled: true, inboundPollMs: 1, outboundPollMs: 1, batchSize: 1000, leaseMs: 200, maxAttemptsInbound: 5, maxAttemptsOutbound: 5, retentionDays: 7 };

describe.skipIf(!url)('Durable channel processing — crash windows & concurrency (disposable PostgreSQL)', () => {
  async function fixture(label: string) {
    const user = await resources!.prisma.user.create({ data: { email: `${label}-${Date.now()}-${Math.random()}@test.local`, name: label } });
    users.push(user.id);
    return user;
  }

  async function conversationFor(userId: string) {
    const conversation = await resources!.prisma.assistantConversation.create({ data: { userId } });
    return conversation.id;
  }

  // Every identifier is suffixed with a per-call unique token — this suite runs
  // against a long-lived disposable database across repeated local iterations
  // (jobs are never hard-deleted, only orphaned via SetNull), so static labels
  // would collide with leftover rows from earlier runs and silently reuse
  // stale state instead of creating fresh rows.
  async function linkedConnection(label: string, text = 'how much did I spend') {
    const unique = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await fixture(unique);
    const linkTokens = createChannelLinkTokenService(resources!.prisma);
    const connections = createChannelConnectionService(resources!.prisma);
    const { token } = await linkTokens.createLinkToken(user.id, 'TELEGRAM');
    const { connectionId } = await linkTokens.consumeLinkToken(token, 'TELEGRAM', `tg-${unique}`, `chat-${unique}`);
    await createInboundJob(resources!.prisma, connectionId, {
      provider: 'TELEGRAM', externalUpdateId: `${unique}-1`, externalChatId: `chat-${unique}`, externalSenderId: `tg-${unique}`, text, receivedAt: new Date(),
    });
    const job = await resources!.prisma.channelInboundJob.findFirstOrThrow({ where: { provider: 'TELEGRAM', externalUpdateId: `${unique}-1` } });
    return { user, connections, linkTokens, connectionId, job };
  }

  function inboundDeps(overrides: Partial<InboundWorkerDeps> = {}, connections = createChannelConnectionService(resources!.prisma), linkTokens = createChannelLinkTokenService(resources!.prisma)): InboundWorkerDeps {
    return { db: resources!.prisma, connections, linkTokens, config: CONFIG, owner: 'test-worker', ...overrides };
  }

  it('two concurrent inbound workers never claim the same job', async () => {
    const { job } = await linkedConnection('conc-in');
    const [batchA, batchB] = await Promise.all([
      claimInboundJobs(resources!.prisma, { batchSize: 1000, leaseMs: 5000, owner: 'worker-a' }),
      claimInboundJobs(resources!.prisma, { batchSize: 1000, leaseMs: 5000, owner: 'worker-b' }),
    ]);
    const claimedIds = [...batchA, ...batchB].map((j) => j.id).filter((id) => id === job.id);
    expect(claimedIds).toHaveLength(1);
  });

  it('a job past its lease expiry is reclaimable by another worker', async () => {
    const { job } = await linkedConnection('lease-expiry');
    await resources!.prisma.channelInboundJob.update({
      where: { id: job.id },
      data: { status: 'PROCESSING', leaseOwner: 'stale-worker', leaseExpiresAt: new Date(Date.now() - 1000), attempt: 1 },
    });
    const reclaimed = await claimInboundJobs(resources!.prisma, { batchSize: 1000, leaseMs: 5000, owner: 'worker-b' });
    const reclaimedJob = reclaimed.find((j) => j.id === job.id);
    expect(reclaimedJob).toBeDefined();
    expect(reclaimedJob!.attempt).toBe(2); // reclaimed -> second attempt
  });

  it('a job still within its lease window is NOT reclaimed by another worker', async () => {
    const { job } = await linkedConnection('lease-active');
    await resources!.prisma.channelInboundJob.update({
      where: { id: job.id },
      data: { status: 'PROCESSING', leaseOwner: 'active-worker', leaseExpiresAt: new Date(Date.now() + 60_000) },
    });
    const claimed = await claimInboundJobs(resources!.prisma, { batchSize: 1000, leaseMs: 5000, owner: 'worker-b' });
    expect(claimed.find((j) => j.id === job.id)).toBeUndefined();
  });

  it('crash-window C: a reclaimed job whose Assistant operation already recorded a turn does not re-invoke the Assistant, and creates exactly one outbound delivery', async () => {
    const { job, connections, linkTokens } = await linkedConnection('crash-c');
    await resources!.prisma.channelAssistantOperation.create({
      data: { id: `channel:telegram:${job.id}`, userId: 'irrelevant', turnId: 'turn-already-done', renderedText: 'Already answered.' },
    });
    const runtime = { sendMessage: vi.fn() };
    const deps = inboundDeps({ assistantProviderRuntime: runtime as never }, connections, linkTokens);
    const claimed = (await claimInboundJobs(resources!.prisma, { batchSize: 1000, leaseMs: 5000, owner: 'worker-a' })).find((j) => j.id === job.id)!;

    await processJob(deps, claimed, 'corr-1');
    await processJob(deps, { ...claimed, attempt: claimed.attempt + 1 }, 'corr-2'); // simulate a second reclaim of the same job

    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(await resources!.prisma.channelOutboundDelivery.count({ where: { inboundJobId: job.id } })).toBe(1);
    const delivery = await resources!.prisma.channelOutboundDelivery.findUniqueOrThrow({ where: { inboundJobId: job.id } });
    expect(delivery.renderedText).toBe('Already answered.');
  });

  it('outbound delivery is created exactly once even if the inbound job is processed twice', async () => {
    const { job, connections, linkTokens, user } = await linkedConnection('outbound-once');
    const conversationId = await conversationFor(user.id);
    const runtime = { sendMessage: vi.fn().mockResolvedValue({ httpStatus: 200, response: { status: 'success', renderedText: 'ok', conversationId, turnId: 'turn-x' } }) };
    const deps = inboundDeps({ assistantProviderRuntime: runtime as never }, connections, linkTokens);
    const claimed = (await claimInboundJobs(resources!.prisma, { batchSize: 1000, leaseMs: 5000, owner: 'worker-a' })).find((j) => j.id === job.id)!;
    await processJob(deps, claimed, 'corr-1');
    // Force a reprocess as if reclaimed (job already SUCCEEDED, but the guard/idempotent create still must hold).
    await processJob(deps, { ...claimed, attempt: claimed.attempt + 1 }, 'corr-2');
    expect(await resources!.prisma.channelOutboundDelivery.count({ where: { inboundJobId: job.id } })).toBe(1);
  });

  it('a revoked connection at processing time gets a safe reply and the job succeeds (not a failure)', async () => {
    const { job, connections, linkTokens, user } = await linkedConnection('revoke-at-process');
    await connections.revoke(user.id, 'TELEGRAM');
    const deps = inboundDeps({}, connections, linkTokens);
    const claimed = (await claimInboundJobs(resources!.prisma, { batchSize: 1000, leaseMs: 5000, owner: 'worker-a' })).find((j) => j.id === job.id)!;
    await processJob(deps, claimed, 'corr-1');
    const updated = await resources!.prisma.channelInboundJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe('SUCCEEDED');
    const delivery = await resources!.prisma.channelOutboundDelivery.findUniqueOrThrow({ where: { inboundJobId: job.id } });
    expect(delivery.renderedText).toMatch(/not linked/i);
  });

  it('/new is processed idempotently: reprocessing the same job does not error or duplicate the delivery', async () => {
    const { job, connections, linkTokens, connectionId, user } = await linkedConnection('new-idem', '/new');
    await connections.setCurrentConversation(connectionId, await conversationFor(user.id));
    const deps = inboundDeps({}, connections, linkTokens);
    const claimed = (await claimInboundJobs(resources!.prisma, { batchSize: 1000, leaseMs: 5000, owner: 'worker-a' })).find((j) => j.id === job.id)!;

    await processJob(deps, claimed, 'corr-1');
    await processJob(deps, { ...claimed, attempt: claimed.attempt + 1 }, 'corr-2');

    const connection = await resources!.prisma.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.conversationId).toBeNull();
    expect(await resources!.prisma.channelOutboundDelivery.count({ where: { inboundJobId: job.id } })).toBe(1);
  });

  it('two concurrent outbound workers never send the same delivery', async () => {
    const { job } = await linkedConnection('conc-out');
    await resources!.prisma.channelOutboundDelivery.create({
      data: { inboundJobId: job.id, provider: 'TELEGRAM', destinationChatId: 'chat-conc-out', renderedText: 'hi' },
    });
    const [batchA, batchB] = await Promise.all([
      claimOutboundDeliveries(resources!.prisma, { batchSize: 1000, leaseMs: 5000, owner: 'worker-a' }),
      claimOutboundDeliveries(resources!.prisma, { batchSize: 1000, leaseMs: 5000, owner: 'worker-b' }),
    ]);
    const claimed = [...batchA, ...batchB].filter((d) => d.inboundJobId === job.id);
    expect(claimed).toHaveLength(1);
  });

  it('a retryable Telegram failure is scheduled for retry; a terminal one is not', async () => {
    const { job: retryJob } = await linkedConnection('outbound-retry');
    const { job: termJob } = await linkedConnection('outbound-terminal');
    await resources!.prisma.channelOutboundDelivery.createMany({
      data: [
        { inboundJobId: retryJob.id, provider: 'TELEGRAM', destinationChatId: 'chat-outbound-retry', renderedText: 'hi' },
        { inboundJobId: termJob.id, provider: 'TELEGRAM', destinationChatId: 'chat-outbound-terminal', renderedText: 'hi' },
      ],
    });
    const claimed = await claimOutboundDeliveries(resources!.prisma, { batchSize: 1000, leaseMs: 5000, owner: 'worker-a' });
    const retryDelivery = claimed.find((d) => d.inboundJobId === retryJob.id)!;
    const termDelivery = claimed.find((d) => d.inboundJobId === termJob.id)!;

    const retryClient = { sendMessage: vi.fn().mockResolvedValue({ ok: false, category: 'provider_unavailable' }), setWebhook: vi.fn(), deleteWebhook: vi.fn() };
    const termClient = { sendMessage: vi.fn().mockResolvedValue({ ok: false, category: 'provider_invalid_response' }), setWebhook: vi.fn(), deleteWebhook: vi.fn() };
    const outboundDeps = (client: unknown): OutboundWorkerDeps => ({ db: resources!.prisma, client: client as never, config: CONFIG, owner: 'worker-a' });

    await processDelivery(outboundDeps(retryClient), retryDelivery);
    await processDelivery(outboundDeps(termClient), termDelivery);

    const retryRow = await resources!.prisma.channelOutboundDelivery.findUniqueOrThrow({ where: { id: retryDelivery.id } });
    const termRow = await resources!.prisma.channelOutboundDelivery.findUniqueOrThrow({ where: { id: termDelivery.id } });
    expect(retryRow.status).toBe('FAILED_RETRYABLE');
    expect(retryRow.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(termRow.status).toBe('FAILED_TERMINAL');
  });

  it('a pending job persists across a simulated process restart (a fresh client can still claim it)', async () => {
    const { job } = await linkedConnection('restart-inbound');
    const restartedClient = createPrismaResources(url!, { max: 2 });
    try {
      const claimed = await claimInboundJobs(restartedClient.prisma, { batchSize: 1000, leaseMs: 5000, owner: 'worker-after-restart' });
      expect(claimed.some((j) => j.id === job.id)).toBe(true);
    } finally {
      await restartedClient.close();
    }
  });

  it('retention cleanup deletes only past-window terminal/succeeded rows, never active or leased ones', async () => {
    const { job: pendingJob } = await linkedConnection('retention-pending');
    const { job: succeededOldJob } = await linkedConnection('retention-succeeded-old');
    const { job: processingJob } = await linkedConnection('retention-processing');

    await resources!.prisma.channelInboundJob.update({ where: { id: succeededOldJob.id }, data: { status: 'SUCCEEDED', completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } });
    await resources!.prisma.channelInboundJob.update({ where: { id: processingJob.id }, data: { status: 'PROCESSING', leaseOwner: 'x', leaseExpiresAt: new Date(Date.now() + 60_000) } });

    await cleanupChannelRecords(resources!.prisma, 7);

    expect(await resources!.prisma.channelInboundJob.findUnique({ where: { id: pendingJob.id } })).not.toBeNull();
    expect(await resources!.prisma.channelInboundJob.findUnique({ where: { id: processingJob.id } })).not.toBeNull();
    expect(await resources!.prisma.channelInboundJob.findUnique({ where: { id: succeededOldJob.id } })).toBeNull();
  });

  it('cross-user isolation: processing one user\'s job never touches another user\'s connection', async () => {
    const a = await linkedConnection('iso-a');
    const b = await linkedConnection('iso-b');
    const deps = inboundDeps({}, a.connections, a.linkTokens);
    // Claim only this job directly (bypassing the batch claim query, which
    // may legitimately sweep up other unrelated pending jobs in the same
    // call — that's correct batching behavior, not an isolation violation).
    const claimed = {
      id: a.job.id,
      provider: a.job.provider,
      externalUpdateId: a.job.externalUpdateId,
      channelConnectionId: a.job.channelConnectionId,
      externalSenderId: a.job.externalSenderId,
      externalChatId: a.job.externalChatId,
      text: a.job.text,
      attempt: 1,
      assistantTurnId: a.job.assistantTurnId,
    };
    await processJob(deps, claimed, 'corr-1');
    const bConnection = await resources!.prisma.channelConnection.findUniqueOrThrow({ where: { id: b.connectionId } });
    expect(bConnection.conversationId).toBeNull();
    const bDeliveryCount = await resources!.prisma.channelOutboundDelivery.count({ where: { inboundJobId: b.job.id } });
    expect(bDeliveryCount).toBe(0);
  });
});

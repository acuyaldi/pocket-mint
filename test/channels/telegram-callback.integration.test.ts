import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createPrismaResources } from '../../src/lib/prismaFactory';
import { assertTestDatabaseUrl } from '../../src/lib/assertTestDatabaseUrl';
import { createChannelLinkTokenService } from '../../src/channels/linkToken.service';
import { createChannelConnectionService } from '../../src/channels/connection.service';
import { createAssistantConversationService } from '../../src/assistant/conversation.service';
import { createAssistantApplicationService } from '../../src/assistant/application.service';
import { createAssistantFinancialDraftService } from '../../src/assistant/financial-draft.service';
import { createClarificationService } from '../../src/assistant/clarification.service';
import { createTransactionService } from '../../src/services/transaction.service';
import { createAssistantProviderRuntime } from '../../src/assistant/provider-runtime';
import { ToolRegistry } from '../../src/assistant/registry';
import { monthlySpendingSummary, transactionCreate } from '../../src/assistant/tools';
import {
  EntityResolverRegistry,
  createEntityResolutionService,
  createWalletResolver,
  createMerchantResolver,
  createCategoryResolver,
} from '../../src/assistant/entity-resolution';
import { createTelegramService } from '../../src/telegram/telegram.service';
import { createCallbackToken } from '../../src/channels/callbackToken.service';
import { processCallback } from '../../src/channels/interaction.service';
import { processJob, type InboundWorkerDeps } from '../../src/channels/workers/inbound.worker';
import { claimInboundJobs } from '../../src/channels/workers/claim';
import type { ChannelWorkerConfig } from '../../src/channels/workerConfig';

const url = process.env.TEST_DATABASE_URL;
if (url) assertTestDatabaseUrl(url);
const resources = url ? createPrismaResources(url, { max: 12 }) : undefined;
const users: string[] = [];
afterAll(() => resources?.close());
afterEach(async () => { if (resources && users.length) await resources.prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } }); });

describe.skipIf(!url)('Telegram interactive callbacks (disposable PostgreSQL)', () => {
  const db = () => resources!.prisma;

  async function fixture(label: string) {
    const user = await db().user.create({ data: { email: `${label}-${Date.now()}-${Math.random()}@test.local`, name: label } });
    users.push(user.id);
    const wallet = await db().wallet.create({ data: { userId: user.id, name: 'Cash', type: 'CASH', balance: 100000 } });
    const category = await db().category.create({ data: { userId: user.id, name: 'Food', type: 'EXPENSE', icon: 'food', color: '#000000' } });
    return { user, wallet, category };
  }

  /** Links a fresh Telegram identity for the user via the real linking flow, and binds a real AssistantConversation to it (FK-satisfying, mirrors what the inbound worker does on the first turn). */
  async function linkedConnection(userId: string, externalUserId: string) {
    const linkTokens = createChannelLinkTokenService(db());
    const connections = createChannelConnectionService(db());
    const { token } = await linkTokens.createLinkToken(userId, 'TELEGRAM');
    await linkTokens.consumeLinkToken(token, 'TELEGRAM', externalUserId, `chat-${externalUserId}`);
    const connection = (await connections.getActiveConnection('TELEGRAM', externalUserId))!;
    const conversation = await db().assistantConversation.create({ data: { userId } });
    await connections.setCurrentConversation(connection.id, conversation.id);
    return { ...connection, conversationId: conversation.id };
  }

  function buildServices() {
    const conversations = createAssistantConversationService(db());
    const drafts = createAssistantFinancialDraftService(db(), createTransactionService(db()));
    const clarification = createClarificationService(db());
    const registry = new ToolRegistry();
    registry.register(monthlySpendingSummary);
    registry.register(transactionCreate);

    const entityResolverRegistry = new EntityResolverRegistry();
    entityResolverRegistry.register(createWalletResolver(db()));
    entityResolverRegistry.register(createMerchantResolver(db()));
    entityResolverRegistry.register(createCategoryResolver(db()));
    entityResolverRegistry.finalize();
    const entityResolution = createEntityResolutionService(entityResolverRegistry);

    const application = createAssistantApplicationService({
      conversations, toolRegistry: registry, handlerRegistry: new Map(), financialDrafts: drafts, entityResolution, clarification,
    });

    // sendMessage() is never exercised in these tests — only the passthroughs — so provider/audit are inert stubs.
    const providerRuntime = createAssistantProviderRuntime({
      application, conversations, financialDrafts: drafts,
      provider: { kind: 'test', model: 'test', generateStructuredResponse: async () => { throw new Error('not used'); } } as never,
      audit: { begin: async () => 'audit-1', finalize: async () => undefined },
      toolRegistry: registry, timeoutMs: 5000,
    });

    return { conversations, drafts, clarification, application, providerRuntime };
  }

  /** Creates a real turn+execution row so the draft's FK columns (originatingTurnId, originatingExecutionId) are satisfiable, then prepares the draft. */
  async function prepareDraft(
    services: ReturnType<typeof buildServices>,
    input: { userId: string; conversationId: string; walletId: string; categoryId: string; amount: string },
  ) {
    const turn = await services.conversations.beginTurn({
      userId: input.userId, conversationId: input.conversationId, correlationId: 'corr-fixture',
      intent: 'transaction.create', locale: 'id-ID', content: 'fixture', source: 'USER_PROVIDED',
    });
    const executionId = await services.conversations.beginToolExecution({
      conversationId: turn.conversationId, turnId: turn.turnId, correlationId: 'corr-fixture',
      toolId: 'transaction.create', capability: 'transaction.create', riskLevel: 'HIGH', policyDecision: 'EXPLICIT',
    });
    return services.drafts.prepare({
      type: 'EXPENSE', amount: input.amount, walletId: input.walletId, categoryId: input.categoryId, date: '2026-07-24',
      userId: input.userId, conversationId: input.conversationId, turnId: turn.turnId, executionId,
    });
  }

  function workerConfig(): ChannelWorkerConfig {
    return { workersEnabled: true, inboundPollMs: 1, outboundPollMs: 1, batchSize: 10, leaseMs: 5000, maxAttemptsInbound: 5, maxAttemptsOutbound: 5, retentionDays: 7 };
  }

  function fakeTelegramClient() {
    return { answerCallbackQuery: async () => ({ ok: true as const }), sendMessage: async () => ({ ok: true as const }), editMessageReplyMarkup: async () => ({ ok: true as const }), setWebhook: async () => ({ ok: true as const }), deleteWebhook: async () => ({ ok: true as const }) };
  }

  let updateIdCounter = 0;
  const processSalt = Math.floor(Math.random() * 1_000_000_000);
  const uniqueUpdateId = () => `${Date.now()}${processSalt}${updateIdCounter++}`;
  const callbackUpdate = (id: number, data: string, senderId: string, chatId: string, messageId = 900) => ({
    update_id: id,
    callback_query: { id: `cbq-${id}`, data, from: { id: senderId }, message: { message_id: messageId, chat: { id: chatId, type: 'private' } } },
  });

  async function ingestCallback(externalUserId: string, chatId: string, data: string) {
    const connections = createChannelConnectionService(db());
    const service = createTelegramService({ db: db(), connections, client: fakeTelegramClient() as never });
    await service.handleUpdate(callbackUpdate(uniqueUpdateId(), data, externalUserId, chatId), 'corr-cb');
    return db().channelInboundJob.findFirstOrThrow({ where: { provider: 'TELEGRAM', externalSenderId: externalUserId, kind: 'CALLBACK' }, orderBy: { createdAt: 'desc' } });
  }

  async function runInboundWorker(providerRuntime: ReturnType<typeof buildServices>['providerRuntime'], owner = 'worker-1') {
    const connections = createChannelConnectionService(db());
    const linkTokens = createChannelLinkTokenService(db());
    const deps: InboundWorkerDeps = { db: db(), connections, linkTokens, assistantProviderRuntime: providerRuntime as never, config: workerConfig(), owner };
    const jobs = await claimInboundJobs(db(), { batchSize: 10, leaseMs: workerConfig().leaseMs, owner });
    for (const job of jobs) await processJob(deps, job, `corr-${job.id}`);
    return jobs;
  }

  it('draft confirm: full pipeline — webhook accepts the callback, worker resolves it, exactly one transaction is created', async () => {
    const { user, wallet, category } = await fixture('draft-confirm');
    const connection = await linkedConnection(user.id, `tg-${user.id}`);
    const services = buildServices();
    const { drafts, providerRuntime } = services;

    const draft = await prepareDraft(services, {
      userId: user.id, conversationId: connection.conversationId!, walletId: wallet.id, categoryId: category.id, amount: '25000',
    });
    const { token } = await createCallbackToken(db(), {
      connectionId: connection.id, conversationId: connection.conversationId!, interactionType: 'DRAFT_CONFIRM', financialDraftId: draft.draftId,
    });

    const job = await ingestCallback(`tg-${user.id}`, `chat-tg-${user.id}`, token);
    expect(job.status).toBe('PENDING');

    await runInboundWorker(providerRuntime);

    const committedDraft = await db().assistantFinancialDraft.findUniqueOrThrow({ where: { id: draft.draftId } });
    expect(committedDraft.status).toBe('COMMITTED');
    expect(await db().transaction.count({ where: { userId: user.id } })).toBe(1);

    const deliveries = await db().channelOutboundDelivery.findMany({ where: { inboundJobId: job.id } });
    expect(deliveries).toHaveLength(2); // result text + keyboard cleanup
    expect(deliveries.find((d) => d.kind === 'EDIT_REPLY_MARKUP')).toMatchObject({ targetMessageId: '900' });

    const consumedToken = await db().channelCallbackToken.findFirstOrThrow({ where: { financialDraftId: draft.draftId } });
    expect(consumedToken.status).toBe('CONSUMED');
    expect(consumedToken.actionSecret).toBeNull();
  });

  it('duplicate callback delivery (retried webhook update_id) never repeats the financial mutation', async () => {
    const { user, wallet, category } = await fixture('draft-dedupe');
    const connection = await linkedConnection(user.id, `tg-${user.id}`);
    const services = buildServices();
    const { drafts, providerRuntime } = services;
    const draft = await prepareDraft(services, {
      userId: user.id, conversationId: connection.conversationId!, walletId: wallet.id, categoryId: category.id, amount: '10000',
    });
    const { token } = await createCallbackToken(db(), { connectionId: connection.id, conversationId: connection.conversationId!, interactionType: 'DRAFT_CONFIRM', financialDraftId: draft.draftId });

    const connections = createChannelConnectionService(db());
    const client = fakeTelegramClient();
    const service = createTelegramService({ db: db(), connections, client: client as never });
    const update = callbackUpdate(uniqueUpdateId(), token, `tg-${user.id}`, `chat-tg-${user.id}`);
    await Promise.all([service.handleUpdate(update, 'c1'), service.handleUpdate(update, 'c2')]);
    expect(await db().channelInboundJob.count({ where: { provider: 'TELEGRAM', externalUpdateId: String(update.update_id) } })).toBe(1);

    await runInboundWorker(providerRuntime);
    expect(await db().transaction.count({ where: { userId: user.id } })).toBe(1);
  });

  it('two independent button presses on the same DRAFT_CONFIRM token race safely to exactly one transaction', async () => {
    const { user, wallet, category } = await fixture('draft-race');
    const connection = await linkedConnection(user.id, `tg-${user.id}`);
    const services = buildServices();
    const { drafts, providerRuntime } = services;
    const draft = await prepareDraft(services, {
      userId: user.id, conversationId: connection.conversationId!, walletId: wallet.id, categoryId: category.id, amount: '15000',
    });
    const { token } = await createCallbackToken(db(), { connectionId: connection.id, conversationId: connection.conversationId!, interactionType: 'DRAFT_CONFIRM', financialDraftId: draft.draftId });

    // Two distinct callback_query update_ids pressing the same button (Telegram may fire this if a user double-taps quickly).
    await ingestCallback(`tg-${user.id}`, `chat-tg-${user.id}`, token);
    await ingestCallback(`tg-${user.id}`, `chat-tg-${user.id}`, token);

    const jobs = await db().channelInboundJob.findMany({ where: { provider: 'TELEGRAM', externalSenderId: `tg-${user.id}`, kind: 'CALLBACK' } });
    expect(jobs).toHaveLength(2);

    await Promise.all(jobs.map(async (j) => {
      const connections = createChannelConnectionService(db());
      const linkTokens = createChannelLinkTokenService(db());
      const deps: InboundWorkerDeps = { db: db(), connections, linkTokens, assistantProviderRuntime: providerRuntime as never, config: workerConfig(), owner: `w-${j.id}` };
      await processJob(deps, { ...j, callbackQueryId: j.callbackQueryId, callbackMessageId: j.callbackMessageId } as never, `corr-${j.id}`);
    }));

    expect(await db().transaction.count({ where: { userId: user.id } })).toBe(1);
    const finalDraft = await db().assistantFinancialDraft.findUniqueOrThrow({ where: { id: draft.draftId } });
    expect(finalDraft.status).toBe('COMMITTED');
  });

  it('confirm-vs-cancel race on the same draft has exactly one authoritative winner', async () => {
    const { user, wallet, category } = await fixture('draft-confirm-cancel-race');
    const connection = await linkedConnection(user.id, `tg-${user.id}`);
    const services = buildServices();
    const { drafts, providerRuntime } = services;
    const draft = await prepareDraft(services, {
      userId: user.id, conversationId: connection.conversationId!, walletId: wallet.id, categoryId: category.id, amount: '20000',
    });
    const confirmToken = await createCallbackToken(db(), { connectionId: connection.id, conversationId: connection.conversationId!, interactionType: 'DRAFT_CONFIRM', financialDraftId: draft.draftId });
    const cancelToken = await createCallbackToken(db(), { connectionId: connection.id, conversationId: connection.conversationId!, interactionType: 'DRAFT_CANCEL', financialDraftId: draft.draftId });

    await ingestCallback(`tg-${user.id}`, `chat-tg-${user.id}`, confirmToken.token);
    await ingestCallback(`tg-${user.id}`, `chat-tg-${user.id}`, cancelToken.token);
    await runInboundWorker(providerRuntime);

    const finalDraft = await db().assistantFinancialDraft.findUniqueOrThrow({ where: { id: draft.draftId } });
    expect(['COMMITTED', 'CANCELLED']).toContain(finalDraft.status);
    const txnCount = await db().transaction.count({ where: { userId: user.id } });
    expect(finalDraft.status === 'COMMITTED' ? txnCount : 0).toBe(finalDraft.status === 'COMMITTED' ? 1 : 0);
  });

  it('revoked connection rejects the callback action — no financial mutation', async () => {
    const { user, wallet, category } = await fixture('draft-revoked');
    const connection = await linkedConnection(user.id, `tg-${user.id}`);
    const connections = createChannelConnectionService(db());
    const services = buildServices();
    const { drafts, providerRuntime } = services;
    const draft = await prepareDraft(services, {
      userId: user.id, conversationId: connection.conversationId!, walletId: wallet.id, categoryId: category.id, amount: '10000',
    });
    const { token } = await createCallbackToken(db(), { connectionId: connection.id, conversationId: connection.conversationId!, interactionType: 'DRAFT_CONFIRM', financialDraftId: draft.draftId });
    await connections.revoke(user.id, 'TELEGRAM');

    await ingestCallback(`tg-${user.id}`, `chat-tg-${user.id}`, token);
    await runInboundWorker(providerRuntime);

    expect(await db().transaction.count({ where: { userId: user.id } })).toBe(0);
    const finalDraft = await db().assistantFinancialDraft.findUniqueOrThrow({ where: { id: draft.draftId } });
    expect(finalDraft.status).toBe('PENDING_CONFIRMATION');
  });

  it('a cross-user token (belonging to a different connection) cannot be actioned by another user\'s Telegram identity', async () => {
    const a = await fixture('cross-a');
    const b = await fixture('cross-b');
    const connA = await linkedConnection(a.user.id, `tg-${a.user.id}`);
    await linkedConnection(b.user.id, `tg-${b.user.id}`);
    const services = buildServices();
    const { drafts, providerRuntime } = services;
    const draft = await prepareDraft(services, {
      userId: a.user.id, conversationId: connA.conversationId!, walletId: a.wallet.id, categoryId: a.category.id, amount: '10000',
    });
    const { token } = await createCallbackToken(db(), { connectionId: connA.id, conversationId: connA.conversationId!, interactionType: 'DRAFT_CONFIRM', financialDraftId: draft.draftId });

    // b's Telegram identity presses a's button (token digest matches, but the sender id doesn't match connA's externalUserId).
    await ingestCallback(`tg-${b.user.id}`, `chat-tg-${b.user.id}`, token);
    await runInboundWorker(providerRuntime);

    expect(await db().transaction.count({ where: { userId: a.user.id } })).toBe(0);
    const finalDraft = await db().assistantFinancialDraft.findUniqueOrThrow({ where: { id: draft.draftId } });
    expect(finalDraft.status).toBe('PENDING_CONFIRMATION');
  });

  it('an expired callback token is rejected and never triggers the action', async () => {
    const { user, wallet, category } = await fixture('draft-expired');
    const connection = await linkedConnection(user.id, `tg-${user.id}`);
    const services = buildServices();
    const { drafts, providerRuntime } = services;
    const draft = await prepareDraft(services, {
      userId: user.id, conversationId: connection.conversationId!, walletId: wallet.id, categoryId: category.id, amount: '10000',
    });
    const { id, token } = await createCallbackToken(db(), { connectionId: connection.id, conversationId: connection.conversationId!, interactionType: 'DRAFT_CONFIRM', financialDraftId: draft.draftId });
    await db().channelCallbackToken.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await ingestCallback(`tg-${user.id}`, `chat-tg-${user.id}`, token);
    await runInboundWorker(providerRuntime);

    expect(await db().transaction.count({ where: { userId: user.id } })).toBe(0);
    expect((await db().channelCallbackToken.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
  });

  it('an already-consumed token cannot be actioned twice even via processCallback called directly (reclaimed-job simulation)', async () => {
    const { user, wallet, category } = await fixture('draft-already-consumed');
    const connection = await linkedConnection(user.id, `tg-${user.id}`);
    const services = buildServices();
    const { drafts, providerRuntime } = services;
    const draft = await prepareDraft(services, {
      userId: user.id, conversationId: connection.conversationId!, walletId: wallet.id, categoryId: category.id, amount: '10000',
    });
    const { token } = await createCallbackToken(db(), { connectionId: connection.id, conversationId: connection.conversationId!, interactionType: 'DRAFT_CONFIRM', financialDraftId: draft.draftId });
    const job = await ingestCallback(`tg-${user.id}`, `chat-tg-${user.id}`, token);
    const claimedJob = { ...job } as never;
    await processCallback({ db: db(), providerRuntime }, claimedJob, 'corr-1');
    const second = await processCallback({ db: db(), providerRuntime }, claimedJob, 'corr-2');

    expect(second.terminalStatus).toBe('consumed');
    expect(await db().transaction.count({ where: { userId: user.id } })).toBe(1);
  });

  it('clarification select via callback: chooses a wallet option, advances to a draft, and consumes the wrapped clarification token', async () => {
    const user = await db().user.create({ data: { email: `wallet-cb-${Date.now()}@test.local`, name: 'wallet-cb' } });
    users.push(user.id);
    const walletA = await db().wallet.create({ data: { userId: user.id, name: 'BCA Debit', type: 'BANK', balance: 500000 } });
    const walletB = await db().wallet.create({ data: { userId: user.id, name: 'BCA Payroll', type: 'BANK', balance: 1000000 } });
    const category = await db().category.create({ data: { userId: user.id, name: 'Food', type: 'EXPENSE', icon: 'food', color: '#000000' } });
    const connection = await linkedConnection(user.id, `tg-${user.id}`);
    const { application, providerRuntime } = buildServices();

    const created = await application.execute(user.id, 'corr-w1', {
      intent: 'transaction.create',
      message: 'Beli makan 50000 pakai BCA',
      arguments: { type: 'EXPENSE', amount: '50000', walletReference: 'BCA', categoryId: category.id, date: '2026-07-24' },
      conversationId: connection.conversationId ?? undefined,
    });
    expect(created.response.status).toBe('clarification_required');
    const clarificationData = (created.response as { data: { clarification: { clarificationId: string; options: { token: string; label: string }[] } } }).data.clarification;
    const chosen = clarificationData.options.find((o) => o.label === 'BCA Debit')!;

    const { token: callbackToken } = await createCallbackToken(db(), {
      connectionId: connection.id, conversationId: (created.response as { conversationId: string }).conversationId,
      interactionType: 'CLARIFICATION_SELECT', clarificationRequestId: clarificationData.clarificationId, actionSecret: chosen.token,
    });

    await ingestCallback(`tg-${user.id}`, `chat-tg-${user.id}`, callbackToken);
    await runInboundWorker(providerRuntime);

    const request = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clarificationData.clarificationId } });
    expect(request.status).toBe('CONSUMED');
    const draftCount = await db().assistantFinancialDraft.count({ where: { userId: user.id } });
    expect(draftCount).toBe(1); // no merchant/category ambiguity for this fixture -> goes straight to draft
    expect(await db().transaction.count({ where: { userId: user.id } })).toBe(0); // still requires explicit confirm
  });

  it('stale keyboard: a callback token for a clarification already consumed via the web path is rejected without reactivating it', async () => {
    const user = await db().user.create({ data: { email: `stale-${Date.now()}@test.local`, name: 'stale' } });
    users.push(user.id);
    const walletA = await db().wallet.create({ data: { userId: user.id, name: 'BCA Debit', type: 'BANK', balance: 500000 } });
    const walletB = await db().wallet.create({ data: { userId: user.id, name: 'BCA Payroll', type: 'BANK', balance: 1000000 } });
    const category = await db().category.create({ data: { userId: user.id, name: 'Food', type: 'EXPENSE', icon: 'food', color: '#000000' } });
    const connection = await linkedConnection(user.id, `tg-${user.id}`);
    const { application, providerRuntime } = buildServices();

    const created = await application.execute(user.id, 'corr-w1', {
      intent: 'transaction.create',
      message: 'Beli makan 50000 pakai BCA',
      arguments: { type: 'EXPENSE', amount: '50000', walletReference: 'BCA', categoryId: category.id, date: '2026-07-24' },
      conversationId: connection.conversationId ?? undefined,
    });
    const clarificationData = (created.response as { data: { clarification: { clarificationId: string; options: { token: string; label: string }[] } } }).data.clarification;
    const conversationId = (created.response as { conversationId: string }).conversationId;
    const optionA = clarificationData.options.find((o) => o.label === 'BCA Debit')!;
    const optionB = clarificationData.options.find((o) => o.label === 'BCA Payroll')!;

    // Web path selects option A first (full continuation, same as the HTTP controller) — the clarification is now CONSUMED and a draft exists.
    await application.selectClarification(user.id, 'corr-web', optionA.token, conversationId, clarificationData.clarificationId);

    // A stale Telegram keyboard button for option B is pressed afterwards.
    const { token: callbackToken } = await createCallbackToken(db(), {
      connectionId: connection.id, conversationId, interactionType: 'CLARIFICATION_SELECT',
      clarificationRequestId: clarificationData.clarificationId, actionSecret: optionB.token,
    });
    await ingestCallback(`tg-${user.id}`, `chat-tg-${user.id}`, callbackToken);
    await runInboundWorker(providerRuntime);

    const request = await db().clarificationRequest.findUniqueOrThrow({ where: { id: clarificationData.clarificationId } });
    expect(request.status).toBe('CONSUMED'); // unchanged — still whatever the web path left it as, not reactivated
    expect(await db().assistantFinancialDraft.count({ where: { userId: user.id } })).toBe(1); // only from the web-path selection
  });

  it('provider message ID from the callback payload is used directly as the keyboard-cleanup target (no separate lookup)', async () => {
    const { user, wallet, category } = await fixture('draft-msgid');
    const connection = await linkedConnection(user.id, `tg-${user.id}`);
    const services = buildServices();
    const { drafts, providerRuntime } = services;
    const draft = await prepareDraft(services, {
      userId: user.id, conversationId: connection.conversationId!, walletId: wallet.id, categoryId: category.id, amount: '10000',
    });
    const { token } = await createCallbackToken(db(), { connectionId: connection.id, conversationId: connection.conversationId!, interactionType: 'DRAFT_CONFIRM', financialDraftId: draft.draftId });

    const connections = createChannelConnectionService(db());
    const client = fakeTelegramClient();
    const service = createTelegramService({ db: db(), connections, client: client as never });
    await service.handleUpdate(callbackUpdate(uniqueUpdateId(), token, `tg-${user.id}`, `chat-tg-${user.id}`, 12345), 'corr-mid');
    const job = await db().channelInboundJob.findFirstOrThrow({ where: { provider: 'TELEGRAM', externalSenderId: `tg-${user.id}`, kind: 'CALLBACK' } });
    expect(job.callbackMessageId).toBe('12345');

    await runInboundWorker(providerRuntime);
    const cleanup = await db().channelOutboundDelivery.findFirstOrThrow({ where: { inboundJobId: job.id, kind: 'EDIT_REPLY_MARKUP' } });
    expect(cleanup.targetMessageId).toBe('12345');
  });
});

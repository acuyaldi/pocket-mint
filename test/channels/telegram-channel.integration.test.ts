import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPrismaResources } from '../../src/lib/prismaFactory';
import { assertTestDatabaseUrl } from '../../src/lib/assertTestDatabaseUrl';
import { createChannelLinkTokenService } from '../../src/channels/linkToken.service';
import { createChannelConnectionService } from '../../src/channels/connection.service';
import { createChannelLinkControllers } from '../../src/controllers/channelLink.controller';
import { createTelegramService } from '../../src/telegram/telegram.service';
import { correlationMiddleware } from '../../src/http/correlation';
import { errorHandler } from '../../src/middlewares/error.middleware';

const url = process.env.TEST_DATABASE_URL;
if (url) assertTestDatabaseUrl(url);
const resources = url ? createPrismaResources(url, { max: 12 }) : undefined;
const users: string[] = [];
afterAll(() => resources?.close());
afterEach(async () => { if (resources && users.length) await resources.prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } }); });

describe.skipIf(!url)('Telegram channel foundation (disposable PostgreSQL)', () => {
  async function fixture(label: string) {
    const user = await resources!.prisma.user.create({ data: { email: `${label}-${Date.now()}-${Math.random()}@test.local`, name: label } });
    users.push(user.id);
    return user;
  }

  /** channel_connections.conversation_id is a real FK — canned Assistant responses in these tests must reference a real conversation. */
  async function conversationFor(userId: string) {
    const conversation = await resources!.prisma.assistantConversation.create({ data: { userId } });
    return conversation.id;
  }

  function linkApp(clock?: () => Date) {
    const linkTokens = createChannelLinkTokenService(resources!.prisma, clock);
    const connections = createChannelConnectionService(resources!.prisma);
    const controllers = createChannelLinkControllers(linkTokens, connections);
    const server = express();
    server.use(express.json());
    server.use(correlationMiddleware);
    server.use((req, _res, next) => { (req as unknown as { auth: { userId: string } }).auth = { userId: req.header('x-test-user')! }; next(); });
    server.post('/telegram/link-token', controllers.createLinkToken);
    server.get('/telegram/connection', controllers.getConnection);
    server.post('/telegram/revoke', controllers.revokeConnection);
    server.use(errorHandler);
    return { server, linkTokens, connections };
  }

  function fakeClient() {
    return { sendMessage: vi.fn().mockResolvedValue({ ok: true }), setWebhook: vi.fn(), deleteWebhook: vi.fn() };
  }

  const privateUpdate = (id: number, text: string, senderId: string, chatId = 'chat-1') => ({
    update_id: id,
    message: { chat: { id: chatId, type: 'private' }, from: { id: senderId }, text },
  });

  it('creates a linking token via HTTP and stores only its digest', async () => {
    const user = await fixture('link-create');
    const { server } = linkApp();
    const res = await request(server).post('/telegram/link-token').set('x-test-user', user.id);
    expect(res.status).toBe(201);
    expect(typeof res.body.data.token).toBe('string');
    const row = await resources!.prisma.channelLinkToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.tokenDigest).not.toBe(res.body.data.token);
  });

  it('consumes a valid token exactly once and links the Telegram identity', async () => {
    const user = await fixture('link-consume');
    const { linkTokens } = linkApp();
    const { token } = await linkTokens.createLinkToken(user.id, 'TELEGRAM');
    const first = await linkTokens.consumeLinkToken(token, 'TELEGRAM', 'tg-1', 'chat-1');
    expect(first.userId).toBe(user.id);
    await expect(linkTokens.consumeLinkToken(token, 'TELEGRAM', 'tg-1', 'chat-1')).rejects.toMatchObject({ code: 'CHANNEL_LINK_INVALID' });
    const connection = await resources!.prisma.channelConnection.findUniqueOrThrow({ where: { id: first.connectionId } });
    expect(connection.status).toBe('ACTIVE');
  });

  it('rejects an expired token using the server clock', async () => {
    const user = await fixture('link-expiry');
    const { linkTokens } = linkApp();
    const { token, expiresAt } = await linkTokens.createLinkToken(user.id, 'TELEGRAM');
    const future = createChannelLinkTokenService(resources!.prisma, () => new Date(expiresAt.getTime() + 1));
    await expect(future.consumeLinkToken(token, 'TELEGRAM', 'tg-2', 'chat-2')).rejects.toMatchObject({ code: 'CHANNEL_LINK_INVALID' });
  });

  it('serializes concurrent consumption of the same token to exactly one connection', async () => {
    const user = await fixture('link-concurrent');
    const { linkTokens } = linkApp();
    const { token } = await linkTokens.createLinkToken(user.id, 'TELEGRAM');
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () => linkTokens.consumeLinkToken(token, 'TELEGRAM', 'tg-concurrent', 'chat-concurrent')),
    );
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect(await resources!.prisma.channelConnection.count({ where: { externalUserId: 'tg-concurrent' } })).toBe(1);
  });

  it('never transfers an identity already linked to a different user', async () => {
    const owner = await fixture('link-owner');
    const other = await fixture('link-other');
    const { linkTokens } = linkApp();
    const ownerToken = await linkTokens.createLinkToken(owner.id, 'TELEGRAM');
    await linkTokens.consumeLinkToken(ownerToken.token, 'TELEGRAM', 'tg-shared', 'chat-shared');
    const otherToken = await linkTokens.createLinkToken(other.id, 'TELEGRAM');
    await expect(linkTokens.consumeLinkToken(otherToken.token, 'TELEGRAM', 'tg-shared', 'chat-shared')).rejects.toMatchObject({ code: 'CHANNEL_LINK_IDENTITY_CONFLICT' });
    const connection = await resources!.prisma.channelConnection.findUniqueOrThrow({ where: { provider_externalUserId: { provider: 'TELEGRAM', externalUserId: 'tg-shared' } } });
    expect(connection.userId).toBe(owner.id);
  });

  it('cross-user isolation: a user only ever sees their own connection status', async () => {
    const owner = await fixture('iso-owner');
    const other = await fixture('iso-other');
    const { server, linkTokens } = linkApp();
    const { token } = await linkTokens.createLinkToken(owner.id, 'TELEGRAM');
    await linkTokens.consumeLinkToken(token, 'TELEGRAM', 'tg-iso', 'chat-iso');
    const ownerView = await request(server).get('/telegram/connection').set('x-test-user', owner.id);
    const otherView = await request(server).get('/telegram/connection').set('x-test-user', other.id);
    expect(ownerView.body.data.status).toBe('ACTIVE');
    expect(otherView.body.data.status).toBe('NONE');
  });

  it('revoking a connection is idempotent and a revoked identity can no longer message the Assistant', async () => {
    const user = await fixture('revoke');
    const { server, linkTokens, connections } = linkApp();
    const { token } = await linkTokens.createLinkToken(user.id, 'TELEGRAM');
    await linkTokens.consumeLinkToken(token, 'TELEGRAM', 'tg-revoke', 'chat-revoke');
    expect((await request(server).post('/telegram/revoke').set('x-test-user', user.id)).status).toBe(200);
    expect((await request(server).post('/telegram/revoke').set('x-test-user', user.id)).status).toBe(200); // idempotent

    const client = fakeClient();
    const service = createTelegramService({ db: resources!.prisma, linkTokens, connections, client: client as never });
    await service.handleUpdate(privateUpdate(1, 'how much did I spend', 'tg-revoke', 'chat-revoke'), 'corr-revoke');
    expect(client.sendMessage).toHaveBeenCalledWith('chat-revoke', expect.stringMatching(/not linked/i));
  });

  it('claims a duplicate Telegram update exactly once under concurrency (no duplicate Assistant turn)', async () => {
    const user = await fixture('dedup');
    const { linkTokens, connections } = linkApp();
    const { token } = await linkTokens.createLinkToken(user.id, 'TELEGRAM');
    await linkTokens.consumeLinkToken(token, 'TELEGRAM', 'tg-dedup', 'chat-dedup');

    const client = fakeClient();
    const conversationId = await conversationFor(user.id);
    const runtime = { sendMessage: vi.fn().mockResolvedValue({ httpStatus: 200, response: { status: 'success', renderedText: 'ok', conversationId } }) };
    const service = createTelegramService({ db: resources!.prisma, linkTokens, connections, client: client as never, assistantProviderRuntime: runtime as never });
    const update = privateUpdate(99, 'how much did I spend', 'tg-dedup', 'chat-dedup');
    await Promise.all([
      service.handleUpdate(update, 'corr-dedup-1'),
      service.handleUpdate(update, 'corr-dedup-2'),
    ]);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(await resources!.prisma.channelUpdateDedup.count({ where: { provider: 'TELEGRAM', externalUpdateId: '99' } })).toBe(1);
  });

  it('/new clears the stored conversation so the next message starts fresh', async () => {
    const user = await fixture('new-cmd');
    const { linkTokens, connections } = linkApp();
    const { token } = await linkTokens.createLinkToken(user.id, 'TELEGRAM');
    const { connectionId } = await linkTokens.consumeLinkToken(token, 'TELEGRAM', 'tg-new', 'chat-new');
    await connections.setCurrentConversation(connectionId, await conversationFor(user.id));

    const client = fakeClient();
    const service = createTelegramService({ db: resources!.prisma, linkTokens, connections, client: client as never });
    await service.handleUpdate(privateUpdate(2, '/new', 'tg-new', 'chat-new'), 'corr-new');
    const connection = await resources!.prisma.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.conversationId).toBeNull();
  });

  it('end-to-end: a linked user reaches the Assistant, and the resulting conversation is persisted on the connection', async () => {
    const user = await fixture('e2e');
    const { linkTokens, connections } = linkApp();
    const { token } = await linkTokens.createLinkToken(user.id, 'TELEGRAM');
    const { connectionId } = await linkTokens.consumeLinkToken(token, 'TELEGRAM', 'tg-e2e', 'chat-e2e');

    const client = fakeClient();
    const conversationId = await conversationFor(user.id);
    const runtime = { sendMessage: vi.fn().mockResolvedValue({ httpStatus: 200, response: { status: 'success', renderedText: 'You spent 10000.', conversationId } }) };
    const service = createTelegramService({ db: resources!.prisma, linkTokens, connections, client: client as never, assistantProviderRuntime: runtime as never });
    await service.handleUpdate(privateUpdate(3, 'how much did I spend this month', 'tg-e2e', 'chat-e2e'), 'corr-e2e');

    expect(runtime.sendMessage).toHaveBeenCalledWith(user.id, 'corr-e2e', { message: 'how much did I spend this month' });
    expect(client.sendMessage).toHaveBeenCalledWith('chat-e2e', 'You spent 10000.');
    const connection = await resources!.prisma.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.conversationId).toBe(conversationId);
  });

  it('rejects a group-chat update without ever touching a connection or the Assistant', async () => {
    const { linkTokens, connections } = linkApp();
    const client = fakeClient();
    const runtime = { sendMessage: vi.fn() };
    const service = createTelegramService({ db: resources!.prisma, linkTokens, connections, client: client as never, assistantProviderRuntime: runtime as never });
    await service.handleUpdate({ update_id: 5, message: { chat: { id: 'g1', type: 'group' }, from: { id: 'tg-group' }, text: 'spend 50000' } }, 'corr-group');
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(client.sendMessage).not.toHaveBeenCalled();
  });
});

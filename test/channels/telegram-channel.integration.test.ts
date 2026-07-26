import { afterAll, afterEach, describe, expect, it } from 'vitest';
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

  const privateUpdate = (id: number, text: string, senderId: string, chatId = 'chat-1') => ({
    update_id: id,
    message: { chat: { id: chatId, type: 'private' }, from: { id: senderId }, text },
  });

  /** update_id is globally unique (provider, externalUpdateId) regardless of sender — never reuse a literal across tests/runs. */
  let updateIdCounter = 0;
  const uniqueUpdateId = () => Date.now() * 1000 + (updateIdCounter++);

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

  it('revoking a connection is idempotent, and the webhook still durably accepts a subsequent update (worker resolves the revocation, not the webhook)', async () => {
    const uid = `revoke-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await fixture('revoke');
    const { server, linkTokens, connections } = linkApp();
    const { token } = await linkTokens.createLinkToken(user.id, 'TELEGRAM');
    await linkTokens.consumeLinkToken(token, 'TELEGRAM', `tg-${uid}`, `chat-${uid}`);
    expect((await request(server).post('/telegram/revoke').set('x-test-user', user.id)).status).toBe(200);
    expect((await request(server).post('/telegram/revoke').set('x-test-user', user.id)).status).toBe(200); // idempotent

    const service = createTelegramService({ db: resources!.prisma, connections });
    await service.handleUpdate(privateUpdate(uniqueUpdateId(), 'how much did I spend', `tg-${uid}`, `chat-${uid}`), 'corr-revoke');
    const job = await resources!.prisma.channelInboundJob.findFirstOrThrow({ where: { provider: 'TELEGRAM', externalSenderId: `tg-${uid}` } });
    expect(job.channelConnectionId).toBeNull(); // revoked identity resolves to no active connection
    expect(job.status).toBe('PENDING');
  });

  it('a retried Telegram update_id durably persists exactly one job under concurrency', async () => {
    const uid = `dedup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await fixture('dedup');
    const { linkTokens, connections } = linkApp();
    const { token } = await linkTokens.createLinkToken(user.id, 'TELEGRAM');
    await linkTokens.consumeLinkToken(token, 'TELEGRAM', `tg-${uid}`, `chat-${uid}`);

    const service = createTelegramService({ db: resources!.prisma, connections });
    const update = privateUpdate(uniqueUpdateId(), 'how much did I spend', `tg-${uid}`, `chat-${uid}`);
    await Promise.all([
      service.handleUpdate(update, 'corr-dedup-1'),
      service.handleUpdate(update, 'corr-dedup-2'),
    ]);
    expect(await resources!.prisma.channelInboundJob.count({ where: { provider: 'TELEGRAM', externalSenderId: `tg-${uid}` } })).toBe(1);
  });

  it('persists only the bounded extracted text — never the raw Telegram update payload', async () => {
    const uid = `no-raw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await fixture('no-raw');
    const { linkTokens, connections } = linkApp();
    const { token } = await linkTokens.createLinkToken(user.id, 'TELEGRAM');
    await linkTokens.consumeLinkToken(token, 'TELEGRAM', `tg-${uid}`, `chat-${uid}`);

    const service = createTelegramService({ db: resources!.prisma, connections });
    await service.handleUpdate(privateUpdate(uniqueUpdateId(), 'spend 50000 on food', `tg-${uid}`, `chat-${uid}`), 'corr-noraw');
    const job = await resources!.prisma.channelInboundJob.findFirstOrThrow({ where: { provider: 'TELEGRAM', externalSenderId: `tg-${uid}` } });
    expect(job.text).toBe('spend 50000 on food');
    expect(Object.keys(job)).not.toContain('message');
    expect(Object.keys(job)).not.toContain('rawUpdate');
  });

  it('rejects a group-chat update without ever creating a job', async () => {
    const { connections } = linkApp();
    const service = createTelegramService({ db: resources!.prisma, connections });
    await service.handleUpdate({ update_id: 5, message: { chat: { id: 'g1', type: 'group' }, from: { id: 'tg-group' }, text: 'spend 50000' } }, 'corr-group');
    expect(await resources!.prisma.channelInboundJob.count({ where: { externalUpdateId: '5' } })).toBe(0);
  });
});

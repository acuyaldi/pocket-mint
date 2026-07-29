import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAssistantControllers } from '../../src/controllers/assistant.controller';
import { correlationMiddleware } from '../../src/http/correlation';
import { errorHandler } from '../../src/middlewares/error.middleware';

const sendMessage = vi.fn();

function app(authenticated = true, runtime: { sendMessage: typeof sendMessage } | null = { sendMessage }) {
  const server = express();
  server.use(express.json());
  server.use(correlationMiddleware);
  if (authenticated) {
    server.use((req, _res, next) => {
      (req as unknown as { auth: { userId: string } }).auth = { userId: 'user-1' };
      next();
    });
  }
  const controllers = createAssistantControllers({} as never, {} as never, undefined, runtime ?? undefined);
  server.post('/v1/assistant/messages', controllers.messages);
  server.use(errorHandler);
  return server;
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMessage.mockResolvedValue({
    httpStatus: 200,
    response: {
      status: 'success',
      renderedText: 'Ringkasan deterministik',
      data: { month: '2026-07' },
      correlationId: 'corr-1',
      conversationId: 'c1',
      turnId: 't1',
    },
  });
});

describe('POST /api/v1/assistant/messages', () => {
  it('requires authentication', async () => {
    const response = await request(app(false)).post('/v1/assistant/messages').send({ message: 'Ringkas Juli' });
    expect(response.status).toBe(401);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('returns a standard success envelope for a new or existing conversation', async () => {
    const response = await request(app()).post('/v1/assistant/messages').send({
      conversationId: 'c1',
      locale: 'id-ID',
      message: 'Ringkas Juli',
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'success', conversationId: 'c1', turnId: 't1' },
    });
    expect(sendMessage).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      { conversationId: 'c1', locale: 'id-ID', message: 'Ringkas Juli' },
    );
  });

  it.each([
    ['missing message', {}],
    ['empty message', { message: '   ' }],
    ['wrong message type', { message: 42 }],
    ['object message', { message: { content: 'hello' } }],
    ['array message', { message: ['hello'] }],
    ['wrong conversation type', { message: 'hello', conversationId: 42 }],
    ['wrong locale type', { message: 'hello', locale: 42 }],
    ['unknown fields', { message: 'hello', userId: 'victim' }],
    ['prototype-related fields', { message: 'hello', constructor: { userId: 'victim' } }],
  ])('rejects %s', async (_label, body) => {
    const response = await request(app()).post('/v1/assistant/messages').send(body);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, error: { code: 'BAD_REQUEST' } });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('rejects a malformed content type before provider execution', async () => {
    const response = await request(app())
      .post('/v1/assistant/messages')
      .set('Content-Type', 'text/plain')
      .send('{"message":"hello"}');

    expect(response.status).toBe(400);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('returns provider failures through the standard error envelope without raw fields', async () => {
    sendMessage.mockResolvedValue({
      httpStatus: 504,
      response: {
        status: 'error',
        code: 'ASSISTANT_PROVIDER_TIMEOUT',
        message: 'Assistant provider request timed out.',
        correlationId: 'corr-1',
        conversationId: 'c1',
        turnId: 't1',
      },
    });
    const response = await request(app()).post('/v1/assistant/messages').send({ message: 'hello' });
    expect(response.status).toBe(504);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'ASSISTANT_PROVIDER_TIMEOUT', statusCode: 504 },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/prompt|providerResponse|usage|apiKey/i);
  });

  it('fails safely when provider execution is disabled', async () => {
    const response = await request(app(true, null)).post('/v1/assistant/messages').send({ message: 'hello' });
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'ASSISTANT_PROVIDER_UNAVAILABLE' },
    });
  });
});

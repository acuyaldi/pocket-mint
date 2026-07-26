import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { correlationMiddleware } from '../../src/http/correlation';

const h = vi.hoisted(() => ({
  telegramConfig: { enabled: true, botToken: 'test-token', webhookSecret: 'correct-secret', botUsername: null },
  telegramService: { handleUpdate: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../src/config', () => ({ telegramConfig: h.telegramConfig }));
vi.mock('../../src/telegram/bootstrap', () => ({ telegramService: h.telegramService }));

import { telegramWebhook, verifyTelegramWebhookSecret } from '../../src/controllers/telegram.controller';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(correlationMiddleware);
  app.post('/webhook', verifyTelegramWebhookSecret, telegramWebhook);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.telegramConfig.enabled = true;
  h.telegramConfig.webhookSecret = 'correct-secret';
});

describe('Telegram webhook controller — boundary', () => {
  it('rejects a request with a missing secret header', async () => {
    const res = await request(buildApp()).post('/webhook').send({ update_id: 1 });
    expect(res.status).toBe(401);
    expect(h.telegramService.handleUpdate).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong secret header', async () => {
    const res = await request(buildApp()).post('/webhook').set('x-telegram-bot-api-secret-token', 'wrong').send({ update_id: 1 });
    expect(res.status).toBe(401);
    expect(h.telegramService.handleUpdate).not.toHaveBeenCalled();
  });

  it('rejects every request when the channel is disabled, even with the right-shaped header', async () => {
    h.telegramConfig.enabled = false;
    const res = await request(buildApp()).post('/webhook').set('x-telegram-bot-api-secret-token', 'correct-secret').send({ update_id: 1 });
    expect(res.status).toBe(401);
    expect(h.telegramService.handleUpdate).not.toHaveBeenCalled();
  });

  it('accepts a request with the correct secret and forwards the raw body to the service', async () => {
    const res = await request(buildApp()).post('/webhook').set('x-telegram-bot-api-secret-token', 'correct-secret').send({ update_id: 42 });
    expect(res.status).toBe(200);
    expect(h.telegramService.handleUpdate).toHaveBeenCalledWith(expect.objectContaining({ update_id: 42 }), expect.any(String));
  });

  it('still returns 200 (safe ack) if the service throws — Telegram must not be told to retry forever', async () => {
    h.telegramService.handleUpdate.mockRejectedValueOnce(new Error('boom'));
    const res = await request(buildApp()).post('/webhook').set('x-telegram-bot-api-secret-token', 'correct-secret').send({ update_id: 1 });
    expect(res.status).toBe(200);
  });

  it('never echoes the configured secret back in the response', async () => {
    const res = await request(buildApp()).post('/webhook').set('x-telegram-bot-api-secret-token', 'wrong').send({ update_id: 1 });
    expect(JSON.stringify(res.body)).not.toContain('correct-secret');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createTelegramClient } from '../../src/telegram/client';

function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
  let call = 0;
  return vi.fn(async () => {
    const r = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
    } as Response;
  });
}

describe('createTelegramClient', () => {
  it('classifies a successful send', async () => {
    const fetchImpl = fakeFetch([{ status: 200 }]);
    const client = createTelegramClient({ botToken: 'test-token', fetchImpl });
    const outcome = await client.sendMessage('123', 'hi');
    expect(outcome).toEqual({ ok: true });
  });

  it('never includes the bot token in the request body', async () => {
    const fetchImpl = fakeFetch([{ status: 200 }]);
    const client = createTelegramClient({ botToken: 'super-secret-token', fetchImpl });
    await client.sendMessage('123', 'hi');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('super-secret-token'); // token is only ever in the URL path, per Telegram's API contract
    expect(String(init?.body)).not.toContain('super-secret-token');
  });

  it('retries once on 429 honoring retry_after, then classifies rate limit if still limited', async () => {
    const fetchImpl = fakeFetch([{ status: 429, body: { parameters: { retry_after: 0 } } }, { status: 429 }]);
    const client = createTelegramClient({ botToken: 'test-token', fetchImpl });
    const outcome = await client.sendMessage('123', 'hi');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(outcome).toEqual({ ok: false, category: 'provider_rate_limit' });
  });

  it('classifies a 5xx as provider_unavailable', async () => {
    const fetchImpl = fakeFetch([{ status: 500 }]);
    const client = createTelegramClient({ botToken: 'test-token', fetchImpl });
    expect(await client.sendMessage('123', 'hi')).toEqual({ ok: false, category: 'provider_unavailable' });
  });

  it('classifies a network failure as provider_unavailable without throwing', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const client = createTelegramClient({ botToken: 'test-token', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await client.sendMessage('123', 'hi')).toEqual({ ok: false, category: 'provider_unavailable' });
  });

  it('classifies a 4xx (other than 429) as provider_invalid_response', async () => {
    const fetchImpl = fakeFetch([{ status: 400 }]);
    const client = createTelegramClient({ botToken: 'test-token', fetchImpl });
    expect(await client.sendMessage('123', 'hi')).toEqual({ ok: false, category: 'provider_invalid_response' });
  });
});

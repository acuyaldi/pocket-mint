// ============================================================
// Telegram Bot API client — minimal typed fetch wrapper.
// ------------------------------------------------------------
// No SDK: this repo's needs (sendMessage, setWebhook, deleteWebhook) don't
// justify a dependency. Never logs the bot token; never throws a raw
// SDK/fetch-shaped error upward — callers get a classified outcome.
// ============================================================

import type { ErrorCategory } from '../utils/logger';

export type TelegramSendOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly category: Extract<ErrorCategory, 'provider_rate_limit' | 'provider_unavailable' | 'provider_invalid_response'> };

interface TelegramClientDeps {
  readonly botToken: string;
  readonly fetchImpl?: typeof fetch;
}

const API_BASE = 'https://api.telegram.org';

export function createTelegramClient(deps: TelegramClientDeps) {
  const doFetch = deps.fetchImpl ?? fetch;
  const base = `${API_BASE}/bot${deps.botToken}`;

  async function call(method: string, body: Record<string, unknown>, retried = false): Promise<TelegramSendOutcome> {
    let response: Response;
    try {
      response = await doFetch(`${base}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, category: 'provider_unavailable' };
    }

    if (response.status === 429 && !retried) {
      let retryAfterSeconds = 1;
      try {
        const payload = (await response.json()) as { parameters?: { retry_after?: number } };
        retryAfterSeconds = payload.parameters?.retry_after ?? 1;
      } catch {
        // ignore, use default backoff
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterSeconds, 5) * 1000));
      return call(method, body, true);
    }
    if (response.status === 429) return { ok: false, category: 'provider_rate_limit' };
    if (response.status >= 500) return { ok: false, category: 'provider_unavailable' };
    if (!response.ok) return { ok: false, category: 'provider_invalid_response' };
    return { ok: true };
  }

  /** Bounded plain-text send. Telegram enforces a 4096-char message cap. */
  async function sendMessage(chatId: string, text: string): Promise<TelegramSendOutcome> {
    return call('sendMessage', { chat_id: chatId, text });
  }

  async function setWebhook(url: string, secretToken: string): Promise<TelegramSendOutcome> {
    return call('setWebhook', { url, secret_token: secretToken, allowed_updates: ['message'] });
  }

  async function deleteWebhook(): Promise<TelegramSendOutcome> {
    return call('deleteWebhook', {});
  }

  return { sendMessage, setWebhook, deleteWebhook };
}

export type TelegramClient = ReturnType<typeof createTelegramClient>;

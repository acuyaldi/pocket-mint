// ============================================================
// Telegram Bot API client — minimal typed fetch wrapper.
// ------------------------------------------------------------
// No SDK: this repo's needs (sendMessage, setWebhook, deleteWebhook,
// answerCallbackQuery, editMessageReplyMarkup) don't justify a dependency.
// Never logs the bot token or request/response bodies; never throws a raw
// SDK/fetch-shaped error upward — callers get a classified outcome. No
// arbitrary method proxy — only the fixed set of methods below.
// ============================================================

import type { ErrorCategory } from '../utils/logger';

export type TelegramSendOutcome =
  | { readonly ok: true; readonly messageId?: string }
  | { readonly ok: false; readonly category: Extract<ErrorCategory, 'provider_rate_limit' | 'provider_unavailable' | 'provider_invalid_response'> };

export type TelegramCallOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly category: Extract<ErrorCategory, 'provider_rate_limit' | 'provider_unavailable' | 'provider_invalid_response'> };

/** Opaque callback handles only — never a real domain identifier. */
export interface TelegramInlineKeyboard {
  readonly inline_keyboard: ReadonlyArray<ReadonlyArray<{ readonly text: string; readonly callback_data: string }>>;
}

interface TelegramClientDeps {
  readonly botToken: string;
  readonly fetchImpl?: typeof fetch;
}

const API_BASE = 'https://api.telegram.org';

export function createTelegramClient(deps: TelegramClientDeps) {
  const doFetch = deps.fetchImpl ?? fetch;
  const base = `${API_BASE}/bot${deps.botToken}`;

  async function call(
    method: string,
    body: Record<string, unknown>,
    retried = false,
  ): Promise<{ ok: true; result: unknown } | { ok: false; category: Extract<ErrorCategory, 'provider_rate_limit' | 'provider_unavailable' | 'provider_invalid_response'> }> {
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

    try {
      const payload = (await response.json()) as { result?: unknown };
      return { ok: true, result: payload.result };
    } catch {
      return { ok: true, result: undefined };
    }
  }

  /** Bounded plain-text send, optionally with an inline keyboard. Telegram enforces a 4096-char message cap. */
  async function sendMessage(chatId: string, text: string, replyMarkup?: TelegramInlineKeyboard): Promise<TelegramSendOutcome> {
    const outcome = await call('sendMessage', {
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    if (!outcome.ok) return outcome;
    const messageId = (outcome.result as { message_id?: number } | undefined)?.message_id;
    return { ok: true, ...(messageId !== undefined ? { messageId: String(messageId) } : {}) };
  }

  /** Replaces (or clears, when `replyMarkup` is omitted) the inline keyboard on an already-sent message. */
  async function editMessageReplyMarkup(chatId: string, messageId: string, replyMarkup?: TelegramInlineKeyboard): Promise<TelegramCallOutcome> {
    return call('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: Number(messageId),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  /**
   * Synchronous, bounded callback acknowledgment. Not the authoritative
   * business result — must never claim success before the durable worker
   * executes. `text` should be neutral (e.g. "Processing…") or omitted.
   */
  async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<TelegramCallOutcome> {
    return call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  }

  async function setWebhook(url: string, secretToken: string): Promise<TelegramCallOutcome> {
    return call('setWebhook', { url, secret_token: secretToken, allowed_updates: ['message', 'callback_query'] });
  }

  async function deleteWebhook(): Promise<TelegramCallOutcome> {
    return call('deleteWebhook', {});
  }

  return { sendMessage, editMessageReplyMarkup, answerCallbackQuery, setWebhook, deleteWebhook };
}

export type TelegramClient = ReturnType<typeof createTelegramClient>;

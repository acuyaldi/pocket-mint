import { describe, expect, it } from 'vitest';
import { parseTelegramUpdate, parseTelegramCallbackQuery } from '../../src/telegram/schema';

const privateMessage = (overrides: Record<string, unknown> = {}) => ({
  update_id: 1001,
  message: {
    chat: { id: 555, type: 'private' },
    from: { id: 42 },
    text: 'Hello',
    ...overrides,
  },
});

describe('parseTelegramUpdate', () => {
  it('accepts a private text message', () => {
    const result = parseTelegramUpdate(privateMessage());
    expect(result).toEqual({ updateId: '1001', chatId: '555', senderId: '42', text: 'Hello' });
  });

  it('rejects group and supergroup chats', () => {
    expect(parseTelegramUpdate({ update_id: 1, message: { chat: { id: 1, type: 'group' }, from: { id: 1 }, text: 'hi' } })).toBeNull();
    expect(parseTelegramUpdate({ update_id: 1, message: { chat: { id: 1, type: 'supergroup' }, from: { id: 1 }, text: 'hi' } })).toBeNull();
    expect(parseTelegramUpdate({ update_id: 1, message: { chat: { id: 1, type: 'channel' }, from: { id: 1 }, text: 'hi' } })).toBeNull();
  });

  it('rejects edited_message, callback_query, and channel_post updates', () => {
    expect(parseTelegramUpdate({ update_id: 1, edited_message: { chat: { id: 1, type: 'private' }, from: { id: 1 }, text: 'hi' } })).toBeNull();
    expect(parseTelegramUpdate({ update_id: 1, callback_query: { data: 'x' } })).toBeNull();
    expect(parseTelegramUpdate({ update_id: 1, channel_post: { chat: { id: 1, type: 'channel' }, text: 'hi' } })).toBeNull();
  });

  it('rejects non-text content (e.g. photo) even in a private chat', () => {
    const update = privateMessage();
    delete (update.message as Record<string, unknown>).text;
    (update.message as Record<string, unknown>).photo = [{ file_id: 'abc' }];
    expect(parseTelegramUpdate(update)).toBeNull();
  });

  it('rejects empty/whitespace-only text', () => {
    expect(parseTelegramUpdate(privateMessage({ text: '   ' }))).toBeNull();
  });

  it('rejects malformed/missing fields', () => {
    expect(parseTelegramUpdate(null)).toBeNull();
    expect(parseTelegramUpdate({})).toBeNull();
    expect(parseTelegramUpdate({ update_id: 1 })).toBeNull();
    expect(parseTelegramUpdate({ update_id: 1, message: { chat: { id: 1, type: 'private' }, text: 'hi' } })).toBeNull(); // missing from
  });
});

const privateCallback = (overrides: Record<string, unknown> = {}) => ({
  update_id: 2001,
  callback_query: {
    id: 'cbq-1',
    data: 'cbk_abc123',
    from: { id: 42 },
    message: { message_id: 777, chat: { id: 555, type: 'private' } },
    ...overrides,
  },
});

describe('parseTelegramCallbackQuery', () => {
  it('accepts a private-chat callback query', () => {
    expect(parseTelegramCallbackQuery(privateCallback())).toEqual({
      updateId: '2001', callbackQueryId: 'cbq-1', chatId: '555', senderId: '42', messageId: '777', data: 'cbk_abc123',
    });
  });

  it('rejects a callback query attached to a group chat', () => {
    const update = privateCallback();
    (update.callback_query as Record<string, unknown>).message = { message_id: 1, chat: { id: 1, type: 'group' } };
    expect(parseTelegramCallbackQuery(update)).toBeNull();
  });

  it('rejects a message update (not a callback query)', () => {
    expect(parseTelegramCallbackQuery({ update_id: 1, message: { chat: { id: 1, type: 'private' }, from: { id: 1 }, text: 'hi' } })).toBeNull();
  });

  it('rejects a missing or empty callback data handle', () => {
    expect(parseTelegramCallbackQuery(privateCallback({ data: undefined }))).toBeNull();
    expect(parseTelegramCallbackQuery(privateCallback({ data: '' }))).toBeNull();
  });

  it('rejects an oversized data handle (beyond Telegram callback_data bounds)', () => {
    expect(parseTelegramCallbackQuery(privateCallback({ data: 'x'.repeat(257) }))).toBeNull();
  });

  it('rejects malformed/missing fields', () => {
    expect(parseTelegramCallbackQuery(null)).toBeNull();
    expect(parseTelegramCallbackQuery({})).toBeNull();
    expect(parseTelegramCallbackQuery({ update_id: 1, callback_query: { id: 'x', data: 'y' } })).toBeNull(); // missing from/message
  });
});

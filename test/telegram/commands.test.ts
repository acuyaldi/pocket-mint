import { describe, expect, it } from 'vitest';
import { parseTelegramCommand } from '../../src/telegram/commands';

describe('parseTelegramCommand', () => {
  it('returns null for plain text (no leading slash)', () => {
    expect(parseTelegramCommand('how much did I spend this month')).toBeNull();
  });

  it.each(['start', 'help', 'new', 'status', 'unlink'])('parses /%s deterministically', (name) => {
    expect(parseTelegramCommand(`/${name}`)).toEqual({ name });
  });

  it('parses /link with a token argument', () => {
    expect(parseTelegramCommand('/link abc123DEF')).toEqual({ name: 'link', token: 'abc123DEF' });
  });

  it('supports the @BotUsername suffix Telegram appends in group-aware clients', () => {
    expect(parseTelegramCommand('/status@PocketMintBot')).toEqual({ name: 'status' });
    expect(parseTelegramCommand('/link@PocketMintBot abc123')).toEqual({ name: 'link', token: 'abc123' });
  });

  it('treats /link with no argument as unknown rather than crashing', () => {
    expect(parseTelegramCommand('/link')).toEqual({ name: 'unknown', raw: '/link' });
  });

  it('treats an unrecognized command as unknown', () => {
    expect(parseTelegramCommand('/nonsense')).toEqual({ name: 'unknown', raw: '/nonsense' });
  });

  it('never interprets natural-language text as a command mapping', () => {
    // Deterministic parsing only — no fuzzy matching against command names.
    expect(parseTelegramCommand('please start a new conversation')).toBeNull();
  });
});

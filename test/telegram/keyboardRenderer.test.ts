import { describe, expect, it } from 'vitest';
import { renderInlineKeyboard } from '../../src/telegram/keyboardRenderer';

describe('renderInlineKeyboard', () => {
  it('maps rows/buttons to Telegram inline_keyboard shape, callback_data is the opaque token only', () => {
    const keyboard = renderInlineKeyboard({
      rows: [[{ label: 'BCA', discriminator: 'BANK', token: 'cbk_1' }, { label: 'Cancel', token: 'cbk_2' }]],
    });
    expect(keyboard).toEqual({
      inline_keyboard: [[
        { text: 'BCA (BANK)', callback_data: 'cbk_1' },
        { text: 'Cancel', callback_data: 'cbk_2' },
      ]],
    });
  });

  it('truncates button text to Telegram\'s limit', () => {
    const keyboard = renderInlineKeyboard({ rows: [[{ label: 'x'.repeat(100), token: 'cbk_1' }]] });
    expect(keyboard.inline_keyboard[0]![0]!.text.length).toBe(64);
  });
});

import { describe, expect, it } from 'vitest';
import { renderAssistantReply, truncateOutbound, WEB_HANDOFF_MESSAGE, MAX_OUTBOUND_LENGTH } from '../../src/telegram/replyRenderer';

describe('renderAssistantReply', () => {
  it('relays a plain successful reply verbatim', () => {
    expect(renderAssistantReply({ status: 'success', renderedText: 'You spent 50000.' })).toBe('You spent 50000.');
  });

  it('prefers message over renderedText when both are present', () => {
    expect(renderAssistantReply({ status: 'success', message: 'msg', renderedText: 'rendered' })).toBe('msg');
  });

  it('sends the web-handoff message (never draft payload/token) when a financial draft is created', () => {
    const text = renderAssistantReply({ status: 'success', data: { draftId: 'draft-secret-1', confirmationRequired: true }, renderedText: 'Draft ready, draft-secret-1' });
    expect(text).toBe(WEB_HANDOFF_MESSAGE);
    expect(text).not.toContain('draft-secret-1');
  });

  it('sends the web-handoff message for clarification_required without leaking clarification data', () => {
    const text = renderAssistantReply({ status: 'clarification_required', message: 'Which wallet?', data: { options: [{ token: 'clarify_secret' }] } });
    expect(text).toBe(WEB_HANDOFF_MESSAGE);
    expect(text).not.toContain('clarify_secret');
  });

  it('falls back to the web-handoff message for an unrecognized/empty response', () => {
    expect(renderAssistantReply(null)).toBe(WEB_HANDOFF_MESSAGE);
    expect(renderAssistantReply({ status: 'success' })).toBe(WEB_HANDOFF_MESSAGE);
  });
});

describe('truncateOutbound', () => {
  it('leaves short text untouched', () => {
    expect(truncateOutbound('hello')).toBe('hello');
  });

  it('truncates and marks text past the bound', () => {
    const long = 'x'.repeat(MAX_OUTBOUND_LENGTH + 500);
    const result = truncateOutbound(long);
    expect(result.length).toBeLessThan(long.length);
    expect(result).toContain('[message truncated]');
  });
});

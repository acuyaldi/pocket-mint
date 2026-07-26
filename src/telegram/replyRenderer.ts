// ============================================================
// Deterministic outbound rendering boundary.
// ------------------------------------------------------------
// Maps an AssistantProviderRuntimeResult response into a bounded, safe plain
// text reply. Pure and side-effect-free so it can be reused by the inbound
// worker to build the persisted ChannelOutboundDelivery.renderedText without
// re-invoking the Assistant. Never renders draft payloads, clarification
// option tokens, or provider internals — only the fixed web-handoff message
// for those cases (see docs/product/decisions/014).
// ============================================================

export const MAX_OUTBOUND_LENGTH = 4000;

export const WEB_HANDOFF_MESSAGE =
  'Please continue in the Pocket Mint web app to review and confirm this — Telegram cannot complete this step yet.';

/** Bounded boolean signal only — mirrors assistant.controller.ts's draftWasCreated. */
function draftWasCreated(response: unknown): boolean {
  if (typeof response !== 'object' || response === null) return false;
  const value = response as { status?: unknown; data?: { confirmationRequired?: unknown } };
  return value.status === 'success' && value.data?.confirmationRequired === true;
}

/** Renders the Assistant's response into the plain text Telegram should receive. */
export function renderAssistantReply(response: unknown): string {
  if (typeof response !== 'object' || response === null) return WEB_HANDOFF_MESSAGE;
  const value = response as { status?: unknown; message?: string; renderedText?: string };
  if (value.status === 'clarification_required' || draftWasCreated(response)) {
    return WEB_HANDOFF_MESSAGE;
  }
  return value.message ?? value.renderedText ?? WEB_HANDOFF_MESSAGE;
}

/** Telegram enforces a 4096-char message cap; stay comfortably under it. */
export function truncateOutbound(text: string): string {
  if (text.length <= MAX_OUTBOUND_LENGTH) return text;
  return `${text.slice(0, MAX_OUTBOUND_LENGTH)}\n\n[message truncated]`;
}

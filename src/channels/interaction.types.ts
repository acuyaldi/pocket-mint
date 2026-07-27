// ============================================================
// Channel interaction — provider-neutral result shapes.
// ------------------------------------------------------------
// What a callback action (or a fresh Assistant turn) produces for a channel
// adapter to render. No Telegram-specific shapes here — the mapping to an
// actual inline keyboard JSON payload lives in the Telegram layer only.
// ============================================================

/** One selectable button — `token` is the ONE-TIME plaintext for this button's ChannelCallbackToken. */
export interface InteractionButton {
  readonly label: string;
  readonly discriminator?: string;
  readonly token: string;
}

export interface InteractionKeyboard {
  /** Rows of buttons, outer array = rows, matches Telegram's inline_keyboard shape without being Telegram-typed. */
  readonly rows: readonly (readonly InteractionButton[])[];
}

export interface CallbackActionResult {
  readonly terminalStatus: string;
  readonly replyText: string;
  /** A fresh clarification/draft this action unlocked — render as a new keyboard. */
  readonly keyboard?: InteractionKeyboard;
  /** True when the underlying action succeeded/terminalized and the original message's keyboard should be cleared. */
  readonly clearOriginalKeyboard: boolean;
}

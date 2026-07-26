// ============================================================
// Channel boundary — provider-agnostic types
// ------------------------------------------------------------
// The canonical shape every channel adapter (Telegram today, possibly Discord/
// WhatsApp later) normalizes into before touching the Assistant application
// boundary. Deliberately narrow: no raw provider payload type is exposed here.
// ============================================================

export type ChannelProviderName = 'TELEGRAM';

export interface InboundChannelMessage {
  readonly provider: ChannelProviderName;
  readonly externalUpdateId: string;
  readonly externalChatId: string;
  readonly externalSenderId: string;
  readonly text: string;
  readonly receivedAt: Date;
}

export interface OutboundChannelMessage {
  readonly text: string;
}

/** Webhook-facing service only — persists inbound jobs, never invokes the Assistant or Telegram delivery (see the channel workers in src/channels/workers/). */
export declare const telegramService: {
    handleUpdate: (rawUpdate: unknown, correlationId: string) => Promise<void>;
} | undefined;

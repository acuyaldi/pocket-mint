/** Webhook-facing service only — persists inbound jobs, synchronously acknowledges callback queries, never invokes the Assistant or sends Telegram deliveries (see the channel workers in src/channels/workers/). */
export declare const telegramService: {
    handleUpdate: (rawUpdate: unknown, correlationId: string) => Promise<void>;
} | undefined;

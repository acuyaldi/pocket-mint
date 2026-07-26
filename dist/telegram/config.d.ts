export interface TelegramConfig {
    readonly enabled: boolean;
    readonly botToken: string | null;
    readonly webhookSecret: string | null;
    readonly botUsername: string | null;
}
type Environment = Readonly<Record<string, string | undefined>>;
/**
 * Loads Telegram channel configuration. Mirrors the hand-rolled pattern in
 * src/config/assistant-provider.ts (no Zod in this repo). Never registers a
 * webhook at boot — see scripts/telegram-set-webhook.mjs for the deliberate,
 * operator-driven registration step.
 */
export declare function loadTelegramConfig(env: Environment): TelegramConfig;
export {};

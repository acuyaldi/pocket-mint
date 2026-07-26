export interface TelegramConfig {
  readonly enabled: boolean;
  readonly botToken: string | null;
  readonly webhookSecret: string | null;
  readonly botUsername: string | null;
}

type Environment = Readonly<Record<string, string | undefined>>;

const text = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

const truthy = (value: string | undefined): boolean => {
  const v = text(value)?.toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
};

/**
 * Loads Telegram channel configuration. Mirrors the hand-rolled pattern in
 * src/config/assistant-provider.ts (no Zod in this repo). Never registers a
 * webhook at boot — see scripts/telegram-set-webhook.mjs for the deliberate,
 * operator-driven registration step.
 */
export function loadTelegramConfig(env: Environment): TelegramConfig {
  const enabled = truthy(env.TELEGRAM_ENABLED);
  if (!enabled) {
    return { enabled: false, botToken: null, webhookSecret: null, botUsername: null };
  }
  const botToken = text(env.TELEGRAM_BOT_TOKEN);
  const webhookSecret = text(env.TELEGRAM_WEBHOOK_SECRET);
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is required when TELEGRAM_ENABLED=true.');
  if (!webhookSecret) throw new Error('TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_ENABLED=true.');
  return { enabled: true, botToken, webhookSecret, botUsername: text(env.TELEGRAM_BOT_USERNAME) ?? null };
}

import type { ErrorCategory } from '../utils/logger';
export type TelegramSendOutcome = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly category: Extract<ErrorCategory, 'provider_rate_limit' | 'provider_unavailable' | 'provider_invalid_response'>;
};
interface TelegramClientDeps {
    readonly botToken: string;
    readonly fetchImpl?: typeof fetch;
}
export declare function createTelegramClient(deps: TelegramClientDeps): {
    sendMessage: (chatId: string, text: string) => Promise<TelegramSendOutcome>;
    setWebhook: (url: string, secretToken: string) => Promise<TelegramSendOutcome>;
    deleteWebhook: () => Promise<TelegramSendOutcome>;
};
export type TelegramClient = ReturnType<typeof createTelegramClient>;
export {};

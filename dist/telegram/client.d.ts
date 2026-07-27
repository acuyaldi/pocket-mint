import type { ErrorCategory } from '../utils/logger';
export type TelegramSendOutcome = {
    readonly ok: true;
    readonly messageId?: string;
} | {
    readonly ok: false;
    readonly category: Extract<ErrorCategory, 'provider_rate_limit' | 'provider_unavailable' | 'provider_invalid_response'>;
};
export type TelegramCallOutcome = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly category: Extract<ErrorCategory, 'provider_rate_limit' | 'provider_unavailable' | 'provider_invalid_response'>;
};
/** Opaque callback handles only — never a real domain identifier. */
export interface TelegramInlineKeyboard {
    readonly inline_keyboard: ReadonlyArray<ReadonlyArray<{
        readonly text: string;
        readonly callback_data: string;
    }>>;
}
interface TelegramClientDeps {
    readonly botToken: string;
    readonly fetchImpl?: typeof fetch;
}
export declare function createTelegramClient(deps: TelegramClientDeps): {
    sendMessage: (chatId: string, text: string, replyMarkup?: TelegramInlineKeyboard) => Promise<TelegramSendOutcome>;
    editMessageReplyMarkup: (chatId: string, messageId: string, replyMarkup?: TelegramInlineKeyboard) => Promise<TelegramCallOutcome>;
    answerCallbackQuery: (callbackQueryId: string, text?: string) => Promise<TelegramCallOutcome>;
    setWebhook: (url: string, secretToken: string) => Promise<TelegramCallOutcome>;
    deleteWebhook: () => Promise<TelegramCallOutcome>;
};
export type TelegramClient = ReturnType<typeof createTelegramClient>;
export {};

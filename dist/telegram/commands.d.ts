export type TelegramCommand = {
    readonly name: 'start' | 'help' | 'new' | 'status' | 'unlink';
} | {
    readonly name: 'link';
    readonly token: string;
} | {
    readonly name: 'unknown';
    readonly raw: string;
};
/** Deterministic command parser, separate from any natural-language handling. Returns null for plain text (no leading `/`). */
export declare function parseTelegramCommand(text: string): TelegramCommand | null;

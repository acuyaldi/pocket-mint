export declare const MAX_OUTBOUND_LENGTH = 4000;
export declare const WEB_HANDOFF_MESSAGE = "Please continue in the Pocket Mint web app to review and confirm this \u2014 Telegram cannot complete this step yet.";
/** Renders the Assistant's response into the plain text Telegram should receive. */
export declare function renderAssistantReply(response: unknown): string;
/** Telegram enforces a 4096-char message cap; stay comfortably under it. */
export declare function truncateOutbound(text: string): string;

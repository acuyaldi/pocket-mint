import type { ChannelLinkTokenService } from '../channels/linkToken.service';
import type { ChannelConnectionService } from '../channels/connection.service';
import type { TelegramCommand } from './commands';
export declare const NOT_LINKED_MESSAGE = "Your Telegram account is not linked yet. Open Pocket Mint on the web, generate a linking code, then send /link <code> here.";
export interface CommandHandlerDeps {
    readonly linkTokens: ChannelLinkTokenService;
    readonly connections: ChannelConnectionService;
}
/** Deterministic, DB-only command handling — no Assistant/network calls. Reused by the inbound worker. */
export declare function handleTelegramCommand(deps: CommandHandlerDeps, command: TelegramCommand, externalSenderId: string, externalChatId: string): Promise<string>;

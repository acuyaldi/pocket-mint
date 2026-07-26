"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTelegramCommand = parseTelegramCommand;
const COMMAND_PATTERN = /^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/s;
/** Deterministic command parser, separate from any natural-language handling. Returns null for plain text (no leading `/`). */
function parseTelegramCommand(text) {
    const match = COMMAND_PATTERN.exec(text.trim());
    if (!match)
        return null;
    const name = match[1].toLowerCase();
    const args = match[2]?.trim() ?? '';
    switch (name) {
        case 'start':
        case 'help':
        case 'new':
        case 'status':
        case 'unlink':
            return { name };
        case 'link':
            return args ? { name: 'link', token: args } : { name: 'unknown', raw: text };
        default:
            return { name: 'unknown', raw: text };
    }
}
//# sourceMappingURL=commands.js.map
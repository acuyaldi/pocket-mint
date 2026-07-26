export type TelegramCommand =
  | { readonly name: 'start' | 'help' | 'new' | 'status' | 'unlink' }
  | { readonly name: 'link'; readonly token: string }
  | { readonly name: 'unknown'; readonly raw: string };

const COMMAND_PATTERN = /^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/s;

/** Deterministic command parser, separate from any natural-language handling. Returns null for plain text (no leading `/`). */
export function parseTelegramCommand(text: string): TelegramCommand | null {
  const match = COMMAND_PATTERN.exec(text.trim());
  if (!match) return null;
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

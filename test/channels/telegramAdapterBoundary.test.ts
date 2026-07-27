import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const TELEGRAM_DIR = join(__dirname, '../../src/telegram');
const CHANNELS_DIR = join(__dirname, '../../src/channels');

function telegramSourceFiles(): string[] {
  return readdirSync(TELEGRAM_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(TELEGRAM_DIR, f));
}

/** Recursive — covers src/channels/*.ts and src/channels/workers/*.ts, where the callback orchestration and worker code live. */
function channelSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...channelSourceFiles(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

// Suffix-based (not exact relative-path) so this holds regardless of a
// file's directory depth (src/channels/*.ts vs src/channels/workers/*.ts).
const FORBIDDEN_IMPORT_SUFFIXES = [
  "services/transaction.service'",
  "services/wallet.service'",
  "services/category.service'",
  "services/merchant.service'",
  "assistant/financial-draft.service'",
  "assistant/clarification.service'",
  "assistant/application.service'",
];

// The only Assistant-namespace imports allowed from Telegram/channel files:
// the provider-runtime passthrough boundary itself, and the shared bounded
// error type (structural only — no clarification/draft logic lives there).
const ALLOWED_ASSISTANT_IMPORTS = ['assistant/provider-runtime', 'assistant/errors'];

// Files whose whole job is calling clarification/financial-draft services
// through the AssistantProviderRuntime passthrough boundary — everything
// else must never import an assistant/* module at all.
const ASSISTANT_IMPORT_ALLOWED_FILES = ['telegram.service.ts', 'interaction.service.ts', 'bootstrap.ts', 'inbound.worker.ts'];

describe('Telegram/channel adapter architecture boundary', () => {
  it('never imports domain mutation services or Assistant Core internals directly', () => {
    for (const file of [...telegramSourceFiles(), ...channelSourceFiles(CHANNELS_DIR)]) {
      const source = readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN_IMPORT_SUFFIXES) {
        expect(source.includes(forbidden), `${file} must not import ${forbidden}`).toBe(false);
      }
    }
  });

  it('reaches the Assistant only through AssistantProviderRuntime (no other Assistant module import)', () => {
    for (const file of [...telegramSourceFiles(), ...channelSourceFiles(CHANNELS_DIR)]) {
      const source = readFileSync(file, 'utf8');
      const assistantImports = [...source.matchAll(/from '([^']*\/assistant\/[^']*)'/g)].map((m) => m[1]);
      if (assistantImports.length === 0) continue;
      const basename = file.split(/[\\/]/).pop()!;
      if (!ASSISTANT_IMPORT_ALLOWED_FILES.includes(basename)) {
        throw new Error(`${file} imports from an Assistant module but is not in ASSISTANT_IMPORT_ALLOWED_FILES: ${assistantImports.join(', ')}`);
      }
      // channels/bootstrap.ts is the composition root wiring the already-built
      // assistantProviderRuntime singleton — it imports the DI module itself,
      // not a specific application/clarification/draft service.
      if (basename === 'bootstrap.ts') continue;
      for (const importPath of assistantImports) {
        expect(ALLOWED_ASSISTANT_IMPORTS.some((allowed) => importPath.endsWith(allowed)), `unexpected Assistant import in ${file}: ${importPath}`).toBe(true);
      }
    }
  });

  it('never persists a raw Telegram update object (only the normalized envelope crosses envelope.ts)', () => {
    const service = readFileSync(join(TELEGRAM_DIR, 'telegram.service.ts'), 'utf8');
    expect(service).not.toMatch(/prisma\.\$queryRaw|channelUpdateDedup\.create\([^)]*rawUpdate/);
  });

  it('callback_data / callback token creation never embeds a domain identifier as the token value (opaque handles only)', () => {
    const source = readFileSync(join(__dirname, '../../src/channels/callbackToken.service.ts'), 'utf8');
    // The plaintext token is always a fresh random value (generateCallbackToken()), never
    // built from clarificationId/draftId/optionId/userId/connectionId.
    expect(source).toMatch(/function generateCallbackToken\(\)[\s\S]*?randomBytes\(/);
    expect(source).not.toMatch(/token\s*=\s*`.*\$\{.*(?:clarification|draft|option|userId|connectionId)/i);
  });
});

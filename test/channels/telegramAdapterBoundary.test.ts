import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const TELEGRAM_DIR = join(__dirname, '../../src/telegram');

function telegramSourceFiles(): string[] {
  return readdirSync(TELEGRAM_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(TELEGRAM_DIR, f));
}

const FORBIDDEN_IMPORTS = [
  '../services/transaction.service',
  '../services/wallet.service',
  '../assistant/financial-draft.service',
  '../assistant/clarification.service',
  '../assistant/application.service',
];

describe('Telegram adapter architecture boundary', () => {
  it('never imports domain mutation services or Assistant Core internals directly', () => {
    for (const file of telegramSourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(source.includes(forbidden), `${file} must not import ${forbidden}`).toBe(false);
      }
    }
  });

  it('reaches the Assistant only through AssistantProviderRuntime (no other Assistant module import)', () => {
    const source = readFileSync(join(TELEGRAM_DIR, 'telegram.service.ts'), 'utf8');
    const assistantImports = [...source.matchAll(/from '([^']*assistant[^']*)'/g)].map((m) => m[1]);
    for (const importPath of assistantImports) {
      expect(importPath, `unexpected Assistant import: ${importPath}`).toBe('../assistant/provider-runtime');
    }
  });

  it('never persists a raw Telegram update object (only the normalized envelope crosses envelope.ts)', () => {
    const service = readFileSync(join(TELEGRAM_DIR, 'telegram.service.ts'), 'utf8');
    expect(service).not.toMatch(/prisma\.\$queryRaw|channelUpdateDedup\.create\([^)]*rawUpdate/);
  });
});

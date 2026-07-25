import { describe, expect, it, vi } from 'vitest';
import { createClarificationService } from '../../src/assistant/clarification.service';

describe('clarification.service runInTransaction', () => {
  it('opens a new interactive transaction when none is supplied', async () => {
    const $transaction = vi.fn((work: (tx: unknown) => unknown) => work('new-tx'));
    const service = createClarificationService({ $transaction } as never);

    const result = await service.runInTransaction(async (tx) => tx);

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(result).toBe('new-tx');
  });

  it('reuses an existing transaction instead of nesting a new one', async () => {
    const $transaction = vi.fn();
    const service = createClarificationService({ $transaction } as never);
    const existing = { __tx: true } as never;

    const result = await service.runInTransaction(async (tx) => tx, existing);

    expect($transaction).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });
});

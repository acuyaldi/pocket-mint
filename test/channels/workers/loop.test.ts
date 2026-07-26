import { describe, expect, it, vi } from 'vitest';
import { runWorkerLoop } from '../../../src/channels/workers/loop';

describe('runWorkerLoop', () => {
  it('stops promptly when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const poll = vi.fn().mockResolvedValue(0);
    await runWorkerLoop({ signal: controller.signal, pollIntervalMs: 1000, poll });
    expect(poll).not.toHaveBeenCalled();
  });

  it('never overlaps two poll invocations — the next poll only starts after the previous one resolves', async () => {
    const controller = new AbortController();
    let concurrent = 0;
    let maxConcurrent = 0;
    let calls = 0;
    const poll = vi.fn(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      calls++;
      if (calls >= 3) controller.abort();
      return 1; // processed something -> no sleep, loop again immediately
    });
    await runWorkerLoop({ signal: controller.signal, pollIntervalMs: 10, poll });
    expect(maxConcurrent).toBe(1);
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('sleeps between empty polls instead of busy-looping', async () => {
    const controller = new AbortController();
    let calls = 0;
    const start = Date.now();
    const poll = vi.fn(async () => {
      calls++;
      if (calls >= 2) controller.abort();
      return 0;
    });
    await runWorkerLoop({ signal: controller.signal, pollIntervalMs: 30, poll });
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });

  it('surfaces poll errors via onError and keeps the loop alive', async () => {
    const controller = new AbortController();
    const onError = vi.fn();
    let calls = 0;
    const poll = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      controller.abort();
      return 0;
    });
    await runWorkerLoop({ signal: controller.signal, pollIntervalMs: 5, poll, onError });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
  });
});

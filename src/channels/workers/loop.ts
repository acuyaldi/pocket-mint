export interface LoopOptions {
  readonly signal: AbortSignal;
  readonly pollIntervalMs: number;
  /** Runs one poll tick; returns the number of items processed (0 triggers the sleep). */
  readonly poll: () => Promise<number>;
  readonly onError?: (error: unknown) => void;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

/**
 * Controlled async loop: wait → claim/process → repeat, stopping on abort.
 * Deliberately not `setInterval` — a slow poll never overlaps the next one.
 */
export async function runWorkerLoop(opts: LoopOptions): Promise<void> {
  while (!opts.signal.aborted) {
    let processed = 0;
    try {
      processed = await opts.poll();
    } catch (error) {
      opts.onError?.(error);
    }
    if (opts.signal.aborted) return;
    if (processed === 0) {
      await sleep(opts.pollIntervalMs, opts.signal);
    }
  }
}

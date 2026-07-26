"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWorkerLoop = runWorkerLoop;
function sleep(ms, signal) {
    if (signal.aborted)
        return Promise.resolve();
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
}
/**
 * Controlled async loop: wait → claim/process → repeat, stopping on abort.
 * Deliberately not `setInterval` — a slow poll never overlaps the next one.
 */
async function runWorkerLoop(opts) {
    while (!opts.signal.aborted) {
        let processed = 0;
        try {
            processed = await opts.poll();
        }
        catch (error) {
            opts.onError?.(error);
        }
        if (opts.signal.aborted)
            return;
        if (processed === 0) {
            await sleep(opts.pollIntervalMs, opts.signal);
        }
    }
}
//# sourceMappingURL=loop.js.map
export interface LoopOptions {
    readonly signal: AbortSignal;
    readonly pollIntervalMs: number;
    /** Runs one poll tick; returns the number of items processed (0 triggers the sleep). */
    readonly poll: () => Promise<number>;
    readonly onError?: (error: unknown) => void;
}
/**
 * Controlled async loop: wait → claim/process → repeat, stopping on abort.
 * Deliberately not `setInterval` — a slow poll never overlaps the next one.
 */
export declare function runWorkerLoop(opts: LoopOptions): Promise<void>;

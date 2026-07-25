import type { AssistantCanonicalRequest } from './types';
export interface ResolvedIntent {
    /** The tool ID this intent maps to (1:1 for Phase 21.2). */
    toolId: string;
    /** Validated tool arguments. */
    arguments: unknown;
}
/**
 * Resolve a canonical request to a known intent.
 *
 * - Only allow-listed intents are accepted.
 * - The intent ID is the tool ID (1:1 mapping for now).
 * - Arguments pass through — the tool's validateInput is the
 *   gate, not the resolver.
 */
export declare function resolveIntent(request: AssistantCanonicalRequest): ResolvedIntent;

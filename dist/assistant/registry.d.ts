import type { ToolContract, ToolId } from './types';
export declare class ToolRegistry {
    private readonly tools;
    /**
     * Register a tool contract. Validates invariants and rejects duplicates.
     * After registration, the contract is frozen — callers cannot mutate it.
     */
    register(tool: ToolContract): void;
    /** Look up a tool by its stable ID, or `undefined` if not registered. */
    get(id: ToolId): ToolContract | undefined;
    /** Return every enabled tool. Disabled tools are invisible to callers. */
    listEnabled(): ToolContract[];
    /** Total number of registered tools (enabled + disabled). */
    get size(): number;
    private validateInvariants;
}

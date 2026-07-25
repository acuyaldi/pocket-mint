import type { ToolId, ExecutionContext, ToolExecutionResult } from './types';
import type { ToolRegistry } from './registry';
/** The handler signature every tool implementation must satisfy. */
export type ToolHandler<TInput = unknown, TOutput = unknown> = (input: TInput, ctx: ExecutionContext) => Promise<TOutput>;
/** Map of tool ID → handler (wired at startup). */
export type HandlerRegistry = Map<ToolId, ToolHandler>;
/**
 * Execute one tool: resolve, validate, enforce policy, invoke,
 * validate output. Returns a structured result — never throws
 * for operational failures (they become `FAILED` results).
 */
export declare function executeTool(toolId: ToolId, untrustedArgs: unknown, ctx: ExecutionContext, toolRegistry: ToolRegistry, handlerRegistry: HandlerRegistry): Promise<ToolExecutionResult>;

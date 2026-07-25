import type { AssistantContext } from './context.types';
import { type AssistantModelRequest, type ProviderCapability } from './provider-types';
export declare function assembleAssistantModelRequest(context: AssistantContext, catalog: readonly ProviderCapability[], signal?: AbortSignal): AssistantModelRequest;

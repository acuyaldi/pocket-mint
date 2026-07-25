import type { EntityResolverRegistry } from './registry';
import { type EntityResolutionResult, type EntityResolutionService, type PublicEntityResolutionResult } from './types';
export declare function createEntityResolutionService(registry: EntityResolverRegistry): EntityResolutionService;
export declare function toPublicEntityResolutionResult(result: EntityResolutionResult): PublicEntityResolutionResult;

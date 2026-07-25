import { type EntityResolver, type EntityType } from './types';
export declare class EntityResolverRegistry {
    private readonly resolvers;
    private finalized;
    register(resolver: EntityResolver): void;
    get(entityType: unknown): EntityResolver | undefined;
    registeredTypes(): readonly EntityType[];
    finalize(): void;
    get isFinalized(): boolean;
}

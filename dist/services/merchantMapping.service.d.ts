import type { CreateMerchantMappingInput, DeleteMerchantMappingInput, ListMerchantMappingsInput, MerchantMappingPrismaClient, MerchantMappingRecord, UpdateMerchantMappingInput } from './merchantMapping.types';
export declare function createMerchantMappingService(db: MerchantMappingPrismaClient): {
    list: (input: ListMerchantMappingsInput) => Promise<MerchantMappingRecord[]>;
    create: (input: CreateMerchantMappingInput) => Promise<MerchantMappingRecord>;
    update: (input: UpdateMerchantMappingInput) => Promise<MerchantMappingRecord>;
    remove: (input: DeleteMerchantMappingInput) => Promise<void>;
    findByNormalizedMerchant: (userId: string, normalizedMerchant: string) => Promise<MerchantMappingRecord | null>;
};
/** Production instance bound to the shared Prisma singleton. */
export declare const merchantMappingService: {
    list: (input: ListMerchantMappingsInput) => Promise<MerchantMappingRecord[]>;
    create: (input: CreateMerchantMappingInput) => Promise<MerchantMappingRecord>;
    update: (input: UpdateMerchantMappingInput) => Promise<MerchantMappingRecord>;
    remove: (input: DeleteMerchantMappingInput) => Promise<void>;
    findByNormalizedMerchant: (userId: string, normalizedMerchant: string) => Promise<MerchantMappingRecord | null>;
};

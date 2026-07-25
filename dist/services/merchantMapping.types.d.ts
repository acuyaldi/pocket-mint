import type { PrismaClient } from '../generated/prisma/client';
export type MerchantMappingPrismaClient = Pick<PrismaClient, 'merchantMapping' | 'category'>;
export interface MerchantMappingRecord {
    id: string;
    userId: string;
    merchantName: string;
    normalizedMerchant: string;
    categoryId: string;
    createdAt: Date;
    updatedAt: Date;
}
/** `userId` is the authenticated caller, never taken from client input. */
export interface CreateMerchantMappingInput {
    userId: string;
    merchantName: string;
    categoryId: string;
}
export interface UpdateMerchantMappingInput {
    userId: string;
    mappingId: string;
    merchantName?: string;
    categoryId?: string;
}
export interface DeleteMerchantMappingInput {
    userId: string;
    mappingId: string;
}
export interface ListMerchantMappingsInput {
    userId: string;
    /** Case-insensitive substring filter on merchantName. */
    search?: string;
}

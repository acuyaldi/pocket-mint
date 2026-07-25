export interface CreateMerchantMappingDto {
    merchantName: string;
    categoryId: string;
}
export interface UpdateMerchantMappingDto {
    merchantName?: string;
    categoryId?: string;
}

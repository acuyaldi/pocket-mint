import type { PrismaClient } from '../generated/prisma/client';
export declare const DEFAULT_CATEGORIES: {
    readonly EXPENSE: readonly ["Makanan", "Transportasi", "Belanja", "Tagihan", "Kesehatan", "Hiburan", "Lainnya"];
    readonly INCOME: readonly ["Gaji", "Bonus", "Investasi", "Hadiah", "Lainnya"];
};
type CategoryPrismaClient = Pick<PrismaClient, 'category'>;
export declare function createCategoryService(db: CategoryPrismaClient): {
    ensureDefaultCategories: (userId: string) => Promise<void>;
    listCategories: (userId: string) => Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        type: import("@/generated/prisma").$Enums.CategoryType;
        icon: string | null;
        color: string | null;
    }[]>;
};
export declare const categoryService: {
    ensureDefaultCategories: (userId: string) => Promise<void>;
    listCategories: (userId: string) => Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        type: import("@/generated/prisma").$Enums.CategoryType;
        icon: string | null;
        color: string | null;
    }[]>;
};
export {};

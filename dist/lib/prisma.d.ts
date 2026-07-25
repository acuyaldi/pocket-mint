import type { Prisma, PrismaClient } from '../generated/prisma/client';
import type { Pool } from 'pg';
/** Shared Prisma client. Import this everywhere (named or default). Lazily connects on first use. */
export declare const prisma: PrismaClient<Prisma.PrismaClientOptions, never, import("@/generated/prisma/runtime/client").DefaultArgs>;
/** Underlying pg pool — exposed for graceful shutdown, not for query use. */
export declare const prismaPool: Pool;
/** Idempotent shutdown: disconnect Prisma and end the pool. No-op if never connected. */
export declare const closePrisma: () => Promise<void>;
export default prisma;

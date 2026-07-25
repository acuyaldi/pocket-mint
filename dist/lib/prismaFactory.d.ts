import { Pool } from 'pg';
import { PrismaClient, Prisma } from '../generated/prisma/client';
/**
 * Prisma 7 uses the `client` engine, which requires a driver adapter to talk to
 * PostgreSQL. This factory owns the composition:
 *
 *   pg.Pool → PrismaPg adapter → PrismaClient({ adapter })
 *
 * The pool is created and OWNED here so its lifecycle is explicit: `close()`
 * disconnects Prisma and ends the pool exactly once. The adapter is told NOT to
 * end the pool itself (`disposeExternalPool` stays false) so cleanup happens in
 * one place and never double-runs.
 *
 * No connection string is ever logged or embedded in an error message.
 */
/** Process-local pool sizing. Undefined fields fall back to `pg` defaults. */
export interface PoolTuning {
    /** Max connections held by this process's pool. */
    max?: number;
    /** Idle connection lifetime before the pool closes it (ms). */
    idleTimeoutMs?: number;
    /** Max time to wait to acquire a connection before failing (ms). */
    connectionTimeoutMs?: number;
}
export interface PrismaResources {
    prisma: PrismaClient;
    pool: Pool;
    /** Idempotent: disconnects Prisma then ends the pool. Safe to call twice. */
    close: () => Promise<void>;
}
/**
 * Build an adapter-backed Prisma client plus its owning pool.
 *
 * @param databaseUrl runtime connection string; required (throws if missing).
 * @param tuning      process-local pool sizing.
 * @param log         Prisma log configuration (preserves existing behavior).
 */
export declare function createPrismaResources(databaseUrl: string | undefined, tuning?: PoolTuning, log?: Prisma.PrismaClientOptions['log']): PrismaResources;

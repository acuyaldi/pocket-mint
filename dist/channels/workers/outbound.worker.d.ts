import type { PrismaClient } from '../../generated/prisma/client';
import type { TelegramClient } from '../../telegram/client';
import { type ClaimedDelivery } from './claim';
import type { ChannelWorkerConfig } from '../workerConfig';
export interface OutboundWorkerDeps {
    readonly db: PrismaClient;
    readonly client: TelegramClient;
    readonly config: ChannelWorkerConfig;
    readonly owner: string;
}
/** Exported for direct unit testing — pollOnce composes this with the raw-SQL claim step. */
export declare function processDelivery(deps: OutboundWorkerDeps, delivery: ClaimedDelivery): Promise<void>;
export declare function createOutboundWorker(deps: OutboundWorkerDeps): {
    pollOnce: () => Promise<number>;
};

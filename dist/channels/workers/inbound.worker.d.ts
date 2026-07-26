import type { PrismaClient } from '../../generated/prisma/client';
import type { ChannelConnectionService } from '../connection.service';
import type { ChannelLinkTokenService } from '../linkToken.service';
import type { AssistantProviderRuntime } from '../../assistant/provider-runtime';
import { type ClaimedInboundJob } from './claim';
import type { ChannelWorkerConfig } from '../workerConfig';
export interface InboundWorkerDeps {
    readonly db: PrismaClient;
    readonly connections: ChannelConnectionService;
    readonly linkTokens: ChannelLinkTokenService;
    readonly assistantProviderRuntime?: AssistantProviderRuntime;
    readonly config: ChannelWorkerConfig;
    readonly owner: string;
}
/** Exported for direct unit testing — pollOnce composes this with the raw-SQL claim step. */
export declare function processJob(deps: InboundWorkerDeps, job: ClaimedInboundJob, correlationId: string): Promise<void>;
export declare function createInboundWorker(deps: InboundWorkerDeps): {
    pollOnce: () => Promise<number>;
};

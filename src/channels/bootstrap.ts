import { randomUUID } from 'crypto';
import prisma from '../lib/prisma';
import { telegramConfig, channelWorkerConfig } from '../config';
import { createChannelLinkTokenService } from './linkToken.service';
import { createChannelConnectionService } from './connection.service';
import { createTelegramClient } from '../telegram/client';
import { assistantProviderRuntime } from '../assistant/bootstrap';
import { createInboundWorker } from './workers/inbound.worker';
import { createOutboundWorker } from './workers/outbound.worker';

export const channelLinkTokenService = createChannelLinkTokenService(prisma);
export const channelConnectionService = createChannelConnectionService(prisma);

/** One process-unique lease-owner id, stable for the process lifetime (used as `leaseOwner`, not an authorization credential). */
const workerOwnerId = randomUUID();

export const channelInboundWorker = telegramConfig.enabled
  ? createInboundWorker({
    db: prisma,
    connections: channelConnectionService,
    linkTokens: channelLinkTokenService,
    assistantProviderRuntime,
    config: channelWorkerConfig,
    owner: workerOwnerId,
  })
  : undefined;

export const channelOutboundWorker = telegramConfig.enabled
  ? createOutboundWorker({
    db: prisma,
    client: createTelegramClient({ botToken: telegramConfig.botToken! }),
    config: channelWorkerConfig,
    owner: workerOwnerId,
  })
  : undefined;

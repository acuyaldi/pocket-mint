import prisma from '../lib/prisma';
import { telegramConfig } from '../config';
import { channelConnectionService } from '../channels/bootstrap';
import { createTelegramService } from './telegram.service';
import { createTelegramClient } from './client';

/** Webhook-facing service only — persists inbound jobs, synchronously acknowledges callback queries, never invokes the Assistant or sends Telegram deliveries (see the channel workers in src/channels/workers/). */
export const telegramService = telegramConfig.enabled
  ? createTelegramService({
    db: prisma,
    connections: channelConnectionService,
    client: createTelegramClient({ botToken: telegramConfig.botToken! }),
  })
  : undefined;

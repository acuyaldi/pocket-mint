import prisma from '../lib/prisma';
import { telegramConfig } from '../config';
import { channelConnectionService } from '../channels/bootstrap';
import { createTelegramService } from './telegram.service';

/** Webhook-facing service only — persists inbound jobs, never invokes the Assistant or Telegram delivery (see the channel workers in src/channels/workers/). */
export const telegramService = telegramConfig.enabled
  ? createTelegramService({
    db: prisma,
    connections: channelConnectionService,
  })
  : undefined;

import prisma from '../lib/prisma';
import { telegramConfig } from '../config';
import { channelLinkTokenService, channelConnectionService } from '../channels/bootstrap';
import { assistantProviderRuntime } from '../assistant/bootstrap';
import { createTelegramClient } from './client';
import { createTelegramService } from './telegram.service';

export const telegramService = telegramConfig.enabled
  ? createTelegramService({
    db: prisma,
    linkTokens: channelLinkTokenService,
    connections: channelConnectionService,
    client: createTelegramClient({ botToken: telegramConfig.botToken! }),
    assistantProviderRuntime,
  })
  : undefined;

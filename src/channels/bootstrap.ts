import prisma from '../lib/prisma';
import { createChannelLinkTokenService } from './linkToken.service';
import { createChannelConnectionService } from './connection.service';

export const channelLinkTokenService = createChannelLinkTokenService(prisma);
export const channelConnectionService = createChannelConnectionService(prisma);

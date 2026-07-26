import { Router } from 'express';
import { createChannelLinkToken, getChannelConnection, revokeChannelConnection } from '../controllers/channelLink.controller';
import { requireUser } from '../middleware/apiKeyAuth';
import { mutationLimiter } from '../middleware/rateLimit';

const channelRouter = Router();

// Authenticated linking API — owner-scoped, same auth/rate-limit conventions
// as every other route module. The public Telegram webhook lives separately
// in telegramRoutes.ts (it cannot require a Pocket Mint bearer token).
channelRouter.post('/telegram/link-token', requireUser, mutationLimiter, createChannelLinkToken);
channelRouter.get('/telegram/connection', requireUser, getChannelConnection);
channelRouter.post('/telegram/revoke', requireUser, mutationLimiter, revokeChannelConnection);

export { channelRouter };

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.channelRouter = void 0;
const express_1 = require("express");
const channelLink_controller_1 = require("../controllers/channelLink.controller");
const apiKeyAuth_1 = require("../middleware/apiKeyAuth");
const rateLimit_1 = require("../middleware/rateLimit");
const channelRouter = (0, express_1.Router)();
exports.channelRouter = channelRouter;
// Authenticated linking API — owner-scoped, same auth/rate-limit conventions
// as every other route module. The public Telegram webhook lives separately
// in telegramRoutes.ts (it cannot require a Pocket Mint bearer token).
channelRouter.post('/telegram/link-token', apiKeyAuth_1.requireUser, rateLimit_1.mutationLimiter, channelLink_controller_1.createChannelLinkToken);
channelRouter.get('/telegram/connection', apiKeyAuth_1.requireUser, channelLink_controller_1.getChannelConnection);
channelRouter.post('/telegram/revoke', apiKeyAuth_1.requireUser, rateLimit_1.mutationLimiter, channelLink_controller_1.revokeChannelConnection);
//# sourceMappingURL=channelRoutes.js.map
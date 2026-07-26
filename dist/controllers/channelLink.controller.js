"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeChannelConnection = exports.getChannelConnection = exports.createChannelLinkToken = void 0;
exports.createChannelLinkControllers = createChannelLinkControllers;
const authContext_1 = require("../http/authContext");
const forwardError_1 = require("../http/forwardError");
const response_1 = require("../utils/response");
const logger_1 = require("../utils/logger");
const bootstrap_1 = require("../channels/bootstrap");
const PROVIDER = 'TELEGRAM';
function createChannelLinkControllers(linkTokens, connections) {
    async function createLinkToken(req, res, next) {
        try {
            const userId = (0, authContext_1.getAuthenticatedUserId)(req);
            if (!userId)
                return (0, response_1.sendError)(res, 'Unauthorized', 401);
            const { token, expiresAt } = await linkTokens.createLinkToken(userId, PROVIDER);
            (0, logger_1.logEvent)('info', { event: 'channel.link.created', requestId: req.correlationId, provider: 'telegram' });
            (0, response_1.sendSuccess)(res, { token, expiresAt }, 'Linking code created', 201);
        }
        catch (error) {
            (0, forwardError_1.forwardError)(error, res, next);
        }
    }
    async function getConnection(req, res, next) {
        try {
            const userId = (0, authContext_1.getAuthenticatedUserId)(req);
            if (!userId)
                return (0, response_1.sendError)(res, 'Unauthorized', 401);
            const connection = await connections.getByUser(userId, PROVIDER);
            if (!connection || connection.status !== 'ACTIVE') {
                return void (0, response_1.sendSuccess)(res, { status: 'NONE' });
            }
            (0, response_1.sendSuccess)(res, { status: 'ACTIVE', linkedAt: connection.linkedAt });
        }
        catch (error) {
            (0, forwardError_1.forwardError)(error, res, next);
        }
    }
    async function revokeConnection(req, res, next) {
        try {
            const userId = (0, authContext_1.getAuthenticatedUserId)(req);
            if (!userId)
                return (0, response_1.sendError)(res, 'Unauthorized', 401);
            await connections.revoke(userId, PROVIDER);
            (0, logger_1.logEvent)('info', { event: 'channel.connection.revoked', requestId: req.correlationId, provider: 'telegram' });
            (0, response_1.sendSuccess)(res, { status: 'REVOKED' }, 'Channel connection revoked');
        }
        catch (error) {
            (0, forwardError_1.forwardError)(error, res, next);
        }
    }
    return { createLinkToken, getConnection, revokeConnection };
}
const controllers = createChannelLinkControllers(bootstrap_1.channelLinkTokenService, bootstrap_1.channelConnectionService);
exports.createChannelLinkToken = controllers.createLinkToken;
exports.getChannelConnection = controllers.getConnection;
exports.revokeChannelConnection = controllers.revokeConnection;
//# sourceMappingURL=channelLink.controller.js.map
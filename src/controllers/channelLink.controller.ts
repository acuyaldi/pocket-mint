import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUserId } from '../http/authContext';
import { forwardError } from '../http/forwardError';
import { sendError, sendSuccess } from '../utils/response';
import { logEvent } from '../utils/logger';
import type { ChannelLinkTokenService } from '../channels/linkToken.service';
import type { ChannelConnectionService } from '../channels/connection.service';
import { channelLinkTokenService, channelConnectionService } from '../channels/bootstrap';

const PROVIDER = 'TELEGRAM' as const;

export function createChannelLinkControllers(linkTokens: ChannelLinkTokenService, connections: ChannelConnectionService) {
  async function createLinkToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return sendError(res, 'Unauthorized', 401);
      const { token, expiresAt } = await linkTokens.createLinkToken(userId, PROVIDER);
      logEvent('info', { event: 'channel.link.created', requestId: req.correlationId, provider: 'telegram' });
      sendSuccess(res, { token, expiresAt }, 'Linking code created', 201);
    } catch (error) {
      forwardError(error, res, next);
    }
  }

  async function getConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return sendError(res, 'Unauthorized', 401);
      const connection = await connections.getByUser(userId, PROVIDER);
      if (!connection || connection.status !== 'ACTIVE') {
        return void sendSuccess(res, { status: 'NONE' as const });
      }
      sendSuccess(res, { status: 'ACTIVE' as const, linkedAt: connection.linkedAt });
    } catch (error) {
      forwardError(error, res, next);
    }
  }

  async function revokeConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return sendError(res, 'Unauthorized', 401);
      await connections.revoke(userId, PROVIDER);
      logEvent('info', { event: 'channel.connection.revoked', requestId: req.correlationId, provider: 'telegram' });
      sendSuccess(res, { status: 'REVOKED' as const }, 'Channel connection revoked');
    } catch (error) {
      forwardError(error, res, next);
    }
  }

  return { createLinkToken, getConnection, revokeConnection };
}

const controllers = createChannelLinkControllers(channelLinkTokenService, channelConnectionService);
export const createChannelLinkToken = controllers.createLinkToken;
export const getChannelConnection = controllers.getConnection;
export const revokeChannelConnection = controllers.revokeConnection;

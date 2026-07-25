import type { NextFunction, Request, Response } from 'express';
import { getAuthenticatedUserId } from '../http/authContext';
import { forwardError } from '../http/forwardError';
import { sendError, sendSuccess } from '../utils/response';
import { assistantApplicationService, assistantConversationService, assistantFinancialDraftService, assistantProviderRuntime } from '../assistant/bootstrap';
import type { AssistantApplicationService } from '../assistant/application.service';
import type { AssistantConversationService } from '../assistant/conversation.service';
import type { AssistantCanonicalRequest } from '../assistant/types';
import type { AssistantFinancialDraftService } from '../assistant/financial-draft.service';
import type { AssistantProviderRuntime } from '../assistant/provider-runtime';

function canonicalRequest(body: unknown): body is AssistantCanonicalRequest {
  if (typeof body !== 'object' || body === null) return false;
  const value = body as Record<string, unknown>;
  return typeof value.intent === 'string' &&
    (value.message === undefined || typeof value.message === 'string') &&
    (value.conversationId === undefined || typeof value.conversationId === 'string') &&
    (value.locale === undefined || typeof value.locale === 'string');
}

function providerMessageRequest(body: unknown): body is { message: string; conversationId?: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const value = body as Record<string, unknown>;
  const keys = Object.keys(value).sort();
  if (keys.some((key) => key !== 'conversationId' && key !== 'message')) return false;
  return typeof value.message === 'string' &&
    Boolean(value.message.trim()) &&
    (value.conversationId === undefined || typeof value.conversationId === 'string');
}

const intQuery = (value: unknown): number | undefined => {
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text !== 'string' || !/^\d+$/.test(text)) return undefined;
  return Number(text);
};

const routeId = (value: string | string[]): string => Array.isArray(value) ? value[0] : value;

/** Strict body for clarification selection — exactly one key: a non-empty, non-whitespace string token. */
function selectClarificationRequest(body: unknown): body is { optionToken: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const value = body as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'optionToken') return false;
  return typeof value.optionToken === 'string' && value.optionToken.trim().length > 0;
}

export function createAssistantControllers(
  application: AssistantApplicationService,
  conversations: AssistantConversationService,
  drafts?: AssistantFinancialDraftService,
  providerRuntime?: AssistantProviderRuntime,
) {
  async function execute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return sendError(res, 'Unauthorized', 401);
      if (!canonicalRequest(req.body)) return sendError(res, 'Request body must include a string "intent" field and valid optional fields', 400, 'BAD_REQUEST');
      const result = await application.execute(userId, req.correlationId, req.body);
      if (result.response.status === 'success') return sendSuccess(res, result.response, 'Assistant executed successfully');
      res.status(result.httpStatus).json({ success: false, error: { ...result.response, statusCode: result.httpStatus } });
    } catch (error) { forwardError(error, res, next); }
  }

  async function messages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return sendError(res, 'Unauthorized', 401);
      if (!providerRuntime) return sendError(res, 'Assistant provider is unavailable', 503, 'ASSISTANT_PROVIDER_UNAVAILABLE');
      if (!providerMessageRequest(req.body)) {
        return sendError(res, 'Request body must include a non-empty string "message" and an optional string "conversationId"', 400, 'BAD_REQUEST');
      }
      const result = await providerRuntime.sendMessage(userId, req.correlationId, {
        message: req.body.message,
        ...(req.body.conversationId === undefined ? {} : { conversationId: req.body.conversationId }),
      });
      if (result.response.status === 'error' || result.response.status === 'rejected') {
        return void res.status(result.httpStatus).json({
          success: false,
          error: { ...result.response, statusCode: result.httpStatus },
        });
      }
      sendSuccess(res, result.response, 'Assistant message processed');
    } catch (error) {
      forwardError(error, res, next);
    }
  }

  async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return sendError(res, 'Unauthorized', 401);
      sendSuccess(res, await conversations.listOwnedConversations(userId, intQuery(req.query.page), intQuery(req.query.limit)));
    } catch (error) { forwardError(error, res, next); }
  }

  async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return sendError(res, 'Unauthorized', 401);
      sendSuccess(res, await conversations.getOwnedConversation(userId, routeId(req.params.conversationId), intQuery(req.query.page), intQuery(req.query.limit)));
    } catch (error) { forwardError(error, res, next); }
  }

  async function archive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return sendError(res, 'Unauthorized', 401);
      sendSuccess(res, await conversations.archiveOwnedConversation(userId, routeId(req.params.conversationId)), 'Conversation archived');
    } catch (error) { forwardError(error, res, next); }
  }
  async function confirmDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return sendError(res, 'Unauthorized', 401);
      if (!drafts) return sendError(res, 'Assistant financial drafts unavailable', 503);
      const result = await drafts.confirm(userId, routeId(req.params.draftId), req.header('Idempotency-Key'), req.correlationId);
      sendSuccess(res, result, 'Financial draft confirmed');
    } catch (error) { forwardError(error, res, next); }
  }
  async function cancelDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return sendError(res, 'Unauthorized', 401);
      if (!drafts) return sendError(res, 'Assistant financial drafts unavailable', 503);
      sendSuccess(res, await drafts.cancel(userId, routeId(req.params.draftId), req.correlationId), 'Financial draft cancelled');
    } catch (error) { forwardError(error, res, next); }
  }
  async function selectClarification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return sendError(res, 'Unauthorized', 401);
      if (!selectClarificationRequest(req.body)) {
        return sendError(res, 'Request body must include a non-empty string "optionToken" and no other fields', 400, 'BAD_REQUEST');
      }
      const conversationId = routeId(req.params.conversationId);
      const clarificationId = routeId(req.params.clarificationId);
      const result = await application.selectClarification(userId, req.correlationId, req.body.optionToken, conversationId, clarificationId);
      if (result.response.status === 'error' || result.response.status === 'rejected') {
        return void res.status(result.httpStatus).json({ success: false, error: { ...result.response, statusCode: result.httpStatus } });
      }
      sendSuccess(res, result.response, 'Clarification processed');
    } catch (error) { forwardError(error, res, next); }
  }
  async function cancelClarification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      if (!userId) return sendError(res, 'Unauthorized', 401);
      const conversationId = routeId(req.params.conversationId);
      const clarificationId = routeId(req.params.clarificationId);
      const result = await application.cancelClarification(userId, req.correlationId, clarificationId, conversationId);
      if (result.response.status === 'error' || result.response.status === 'rejected') {
        return void res.status(result.httpStatus).json({ success: false, error: { ...result.response, statusCode: result.httpStatus } });
      }
      sendSuccess(res, result.response, 'Clarification cancelled');
    } catch (error) { forwardError(error, res, next); }
  }
  return { execute, messages, list, get, archive, confirmDraft, cancelDraft, selectClarification, cancelClarification };
}

const controllers = createAssistantControllers(assistantApplicationService, assistantConversationService, assistantFinancialDraftService, assistantProviderRuntime);
export const assistantExecute = controllers.execute;
export const assistantMessages = controllers.messages;
export const listAssistantConversations = controllers.list;
export const getAssistantConversation = controllers.get;
export const archiveAssistantConversation = controllers.archive;
export const confirmAssistantFinancialDraft = controllers.confirmDraft;
export const cancelAssistantFinancialDraft = controllers.cancelDraft;
export const selectAssistantClarification = controllers.selectClarification;
export const cancelAssistantClarification = controllers.cancelClarification;

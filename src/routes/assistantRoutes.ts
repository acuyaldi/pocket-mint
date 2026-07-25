import { Router } from 'express';
import { archiveAssistantConversation, assistantExecute, assistantMessages, cancelAssistantClarification, cancelAssistantFinancialDraft, confirmAssistantFinancialDraft, getAssistantConversation, listAssistantConversations, selectAssistantClarification } from '../controllers/assistant.controller';
import { requireUser } from '../middleware/apiKeyAuth';
import { mutationLimiter } from '../middleware/rateLimit';

const assistantRouter = Router();

// All Assistant endpoints require a verified user — the
// authenticated userId is the sole identity source.
assistantRouter.post('/execute', requireUser, mutationLimiter, assistantExecute);
assistantRouter.post('/messages', requireUser, mutationLimiter, assistantMessages);
assistantRouter.get('/conversations', requireUser, listAssistantConversations);
assistantRouter.get('/conversations/:conversationId', requireUser, getAssistantConversation);
assistantRouter.post('/conversations/:conversationId/archive', requireUser, mutationLimiter, archiveAssistantConversation);
assistantRouter.post('/drafts/:draftId/confirm', requireUser, mutationLimiter, confirmAssistantFinancialDraft);
assistantRouter.post('/drafts/:draftId/cancel', requireUser, mutationLimiter, cancelAssistantFinancialDraft);
assistantRouter.post('/conversations/:conversationId/clarifications/:clarificationId/select', requireUser, mutationLimiter, selectAssistantClarification);
assistantRouter.post('/conversations/:conversationId/clarifications/:clarificationId/cancel', requireUser, mutationLimiter, cancelAssistantClarification);

export { assistantRouter };

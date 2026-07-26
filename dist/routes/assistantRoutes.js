"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assistantRouter = void 0;
const express_1 = require("express");
const assistant_controller_1 = require("../controllers/assistant.controller");
const apiKeyAuth_1 = require("../middleware/apiKeyAuth");
const rateLimit_1 = require("../middleware/rateLimit");
const assistantRouter = (0, express_1.Router)();
exports.assistantRouter = assistantRouter;
// All Assistant endpoints require a verified user — the
// authenticated userId is the sole identity source.
assistantRouter.post('/execute', apiKeyAuth_1.requireUser, rateLimit_1.mutationLimiter, assistant_controller_1.assistantExecute);
assistantRouter.post('/messages', apiKeyAuth_1.requireUser, rateLimit_1.mutationLimiter, assistant_controller_1.assistantMessages);
assistantRouter.get('/conversations', apiKeyAuth_1.requireUser, assistant_controller_1.listAssistantConversations);
assistantRouter.get('/conversations/:conversationId', apiKeyAuth_1.requireUser, assistant_controller_1.getAssistantConversation);
assistantRouter.get('/conversations/:conversationId/recovery-state', apiKeyAuth_1.requireUser, assistant_controller_1.getAssistantRecoveryState);
assistantRouter.post('/conversations/:conversationId/archive', apiKeyAuth_1.requireUser, rateLimit_1.mutationLimiter, assistant_controller_1.archiveAssistantConversation);
assistantRouter.post('/drafts/:draftId/confirm', apiKeyAuth_1.requireUser, rateLimit_1.mutationLimiter, assistant_controller_1.confirmAssistantFinancialDraft);
assistantRouter.post('/drafts/:draftId/cancel', apiKeyAuth_1.requireUser, rateLimit_1.mutationLimiter, assistant_controller_1.cancelAssistantFinancialDraft);
assistantRouter.post('/conversations/:conversationId/clarifications/:clarificationId/select', apiKeyAuth_1.requireUser, rateLimit_1.mutationLimiter, assistant_controller_1.selectAssistantClarification);
assistantRouter.post('/conversations/:conversationId/clarifications/:clarificationId/cancel', apiKeyAuth_1.requireUser, rateLimit_1.mutationLimiter, assistant_controller_1.cancelAssistantClarification);
//# sourceMappingURL=assistantRoutes.js.map
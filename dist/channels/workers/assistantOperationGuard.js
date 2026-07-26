"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.channelOperationId = channelOperationId;
exports.beginAssistantOperation = beginAssistantOperation;
exports.completeAssistantOperation = completeAssistantOperation;
function channelOperationId(provider, inboundJobId) {
    return `channel:${provider.toLowerCase()}:${inboundJobId}`;
}
/**
 * Operation-identity guard binding one inbound job to at most one Assistant
 * turn (see docs/product/decisions/015 — the Assistant module itself has no
 * request-level idempotency contract, so this lives entirely in the channel
 * layer instead of touching it). Insert-first-wins: a conflict means a
 * previous attempt on this exact job already started.
 */
async function beginAssistantOperation(db, operationId, userId) {
    try {
        await db.channelAssistantOperation.create({ data: { id: operationId, userId } });
        return { status: 'new' };
    }
    catch (error) {
        if (error.code !== 'P2002')
            throw error;
        const existing = await db.channelAssistantOperation.findUniqueOrThrow({ where: { id: operationId } });
        return existing.turnId && existing.renderedText
            ? { status: 'replay', turnId: existing.turnId, renderedText: existing.renderedText }
            : { status: 'ambiguous' };
    }
}
async function completeAssistantOperation(db, operationId, turnId, renderedText) {
    await db.channelAssistantOperation.update({ where: { id: operationId }, data: { turnId, renderedText } });
}
//# sourceMappingURL=assistantOperationGuard.js.map
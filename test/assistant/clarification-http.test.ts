// ============================================================
// Tests: Clarification HTTP boundary (controller + route)
// ------------------------------------------------------------
// Mocked application service — verifies auth, strict body
// validation, route scoping wiring, error-to-status mapping, and
// that no secret/internal field ever reaches the response body.
// ============================================================
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import { createAssistantControllers } from '../../src/controllers/assistant.controller';
import { errorHandler } from '../../src/middlewares/error.middleware';
import { correlationMiddleware } from '../../src/http/correlation';

const USER = 'user-1';

const h = vi.hoisted(() => ({
  selectClarification: vi.fn(),
  cancelClarification: vi.fn(),
}));

function buildApp(injectUser = true): express.Express {
  const app = express();
  app.use(express.json());
  app.use(correlationMiddleware);
  if (injectUser) {
    app.use((req, _res, next) => {
      (req as unknown as { auth: { userId: string } }).auth = { userId: USER };
      next();
    });
  }
  const application = { selectClarification: h.selectClarification, cancelClarification: h.cancelClarification } as any;
  const conversations = {} as any;
  const controllers = createAssistantControllers(application, conversations);
  app.post('/assistant/conversations/:conversationId/clarifications/:clarificationId/select', controllers.selectClarification);
  app.post('/assistant/conversations/:conversationId/clarifications/:clarificationId/cancel', controllers.cancelClarification);
  app.use(errorHandler);
  return app;
}

const CONV = 'conv-1';
const CLAR = 'clar-1';
const selectPath = (conversationId = CONV, clarificationId = CLAR) => `/assistant/conversations/${conversationId}/clarifications/${clarificationId}/select`;
const cancelPath = (conversationId = CONV, clarificationId = CLAR) => `/assistant/conversations/${conversationId}/clarifications/${clarificationId}/cancel`;

beforeEach(() => {
  vi.clearAllMocks();
  h.selectClarification.mockResolvedValue({
    httpStatus: 200,
    response: { status: 'clarification_required', message: 'Pilih wallet', data: { kind: 'entity_selection', entityType: 'merchant', clarification: { clarificationId: 'clar-2', entityType: 'merchant', prompt: 'Pilih merchant', options: [{ token: 'clarify_new', label: 'Starbucks' }] } }, correlationId: 'corr-1', conversationId: CONV, turnId: 't1' },
  });
  h.cancelClarification.mockResolvedValue({
    httpStatus: 200,
    response: { status: 'success', renderedText: 'Klarifikasi dibatalkan.', data: { clarificationId: CLAR, status: 'CANCELLED' }, correlationId: 'corr-2', conversationId: CONV, turnId: 't2' },
  });
});

// ---- Authentication ---------------------------------------------------------

describe('POST .../clarifications/:id/select — authentication', () => {
  it('rejects unauthenticated select with 401', async () => {
    const res = await request(buildApp(false)).post(selectPath()).send({ optionToken: 'clarify_abc' });
    expect(res.status).toBe(401);
    expect(h.selectClarification).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated cancel with 401', async () => {
    const res = await request(buildApp(false)).post(cancelPath()).send({});
    expect(res.status).toBe(401);
    expect(h.cancelClarification).not.toHaveBeenCalled();
  });

  it('rejects a body-supplied userId (strict schema has no such field; identity comes only from req.auth)', async () => {
    const res = await request(buildApp()).post(selectPath()).send({ optionToken: 'clarify_abc', userId: 'attacker' });
    expect(res.status).toBe(400);
    expect(h.selectClarification).not.toHaveBeenCalled();
  });

  it('uses only the trusted req.auth identity for a valid request', async () => {
    const res = await request(buildApp()).post(selectPath()).send({ optionToken: 'clarify_abc' });
    expect(res.status).toBe(200);
    expect(h.selectClarification).toHaveBeenCalledWith(USER, expect.any(String), 'clarify_abc', CONV, CLAR);
  });
});

// ---- Route scoping ------------------------------------------------------------

describe('POST .../clarifications/:id/select — route scoping', () => {
  it('passes conversationId and clarificationId from route params to the application service', async () => {
    const res = await request(buildApp()).post(selectPath('conv-x', 'clar-y')).send({ optionToken: 'clarify_abc' });
    expect(res.status).toBe(200);
    expect(h.selectClarification).toHaveBeenCalledWith(USER, expect.any(String), 'clarify_abc', 'conv-x', 'clar-y');
  });

  it('returns a bounded not-found response when the application service reports ASSISTANT_CLARIFICATION_NOT_FOUND', async () => {
    h.selectClarification.mockResolvedValue({
      httpStatus: 404,
      response: { status: 'error', code: 'ASSISTANT_CLARIFICATION_NOT_FOUND', message: 'Clarification not found', correlationId: 'corr-3', conversationId: CONV, turnId: 't3' },
    });
    const res = await request(buildApp()).post(selectPath()).send({ optionToken: 'clarify_abc' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ASSISTANT_CLARIFICATION_NOT_FOUND');
  });
});

// ---- Strict body validation ---------------------------------------------------

describe('POST .../clarifications/:id/select — strict body validation', () => {
  const rejected = async (body: unknown) => {
    const res = await request(buildApp()).post(selectPath()).send(body as never);
    expect(res.status).toBe(400);
    expect(h.selectClarification).not.toHaveBeenCalled();
  };

  it('rejects missing optionToken', () => rejected({}));
  it('rejects null optionToken', () => rejected({ optionToken: null }));
  it('rejects empty optionToken', () => rejected({ optionToken: '' }));
  it('rejects whitespace-only optionToken', () => rejected({ optionToken: '   ' }));
  it('rejects a non-string optionToken', () => rejected({ optionToken: 12345 }));
  it('rejects a malformed/object token', () => rejected({ optionToken: { raw: 'x' } }));
  it('rejects a candidateId field', () => rejected({ optionToken: 'clarify_abc', candidateId: 'c1' }));
  it('rejects an optionId field', () => rejected({ optionToken: 'clarify_abc', optionId: 'o1' }));
  it('rejects an optionIndex field', () => rejected({ optionToken: 'clarify_abc', optionIndex: 0 }));
  it('rejects a label field', () => rejected({ optionToken: 'clarify_abc', label: 'BCA' }));
  it('rejects an entityId field', () => rejected({ optionToken: 'clarify_abc', entityId: 'e1' }));
  it('rejects a userId field alongside a valid token plus extra keys', () => rejected({ optionToken: 'clarify_abc', userId: 'x', extra: 1 }));
  it('rejects a conversationId field in the body', () => rejected({ optionToken: 'clarify_abc', conversationId: CONV }));
  it('rejects a clarificationId field in the body', () => rejected({ optionToken: 'clarify_abc', clarificationId: CLAR }));
  it('rejects unknown additional properties', () => rejected({ optionToken: 'clarify_abc', unexpected: true }));
  it('rejects nested metadata', () => rejected({ optionToken: 'clarify_abc', metadata: { foo: 'bar' } }));
  it('rejects a provider payload field', () => rejected({ optionToken: 'clarify_abc', providerPayload: { raw: 'x' } }));
  it('rejects a confidence field', () => rejected({ optionToken: 'clarify_abc', confidence: 0.9 }));
  it('rejects an evidence field', () => rejected({ optionToken: 'clarify_abc', evidence: [] }));
  it('rejects a non-object body', async () => {
    const res = await request(buildApp()).post(selectPath()).send('not-an-object').set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('accepts exactly { optionToken: string }', async () => {
    const res = await request(buildApp()).post(selectPath()).send({ optionToken: 'clarify_abc' });
    expect(res.status).toBe(200);
    expect(h.selectClarification).toHaveBeenCalledTimes(1);
  });
});

// ---- Select lifecycle mapping ---------------------------------------------------

describe('POST .../clarifications/:id/select — lifecycle mapping', () => {
  const cases: [string, string, number][] = [
    ['ASSISTANT_CLARIFICATION_NOT_FOUND', 'not found', 404],
    ['ASSISTANT_CLARIFICATION_INVALID_OPTION', 'invalid option', 400],
    ['ASSISTANT_CLARIFICATION_ALREADY_CONSUMED', 'already consumed', 409],
    ['ASSISTANT_CLARIFICATION_CANCELLED', 'cancelled', 409],
    ['ASSISTANT_CLARIFICATION_STALE', 'stale', 409],
    ['ASSISTANT_CLARIFICATION_EXPIRED', 'expired', 409],
    ['ASSISTANT_CLARIFICATION_CONTINUATION_INVALID', 'continuation invalid', 409],
    ['ASSISTANT_CLARIFICATION_CONTEXT_INVALID', 'context invalid', 409],
    ['ASSISTANT_CLARIFICATION_FAILED', 'transient failure', 500],
  ];

  it.each(cases)('maps %s to HTTP %i', async (code, _label, status) => {
    h.selectClarification.mockResolvedValue({
      httpStatus: status,
      response: { status: 'error', code, message: 'safe message', correlationId: 'corr-x', conversationId: CONV, turnId: 't1' },
    });
    const res = await request(buildApp()).post(selectPath()).send({ optionToken: 'clarify_abc' });
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });

  it('returns 200 with child clarification creation result', async () => {
    const res = await request(buildApp()).post(selectPath()).send({ optionToken: 'clarify_abc' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('clarification_required');
    expect(res.body.data.data.clarification.options[0].token).toBe('clarify_new');
  });

  it('returns 200 with pending draft creation result', async () => {
    h.selectClarification.mockResolvedValue({
      httpStatus: 200,
      response: { status: 'success', renderedText: 'Draft menunggu konfirmasi.', data: { draftId: 'd1', status: 'PENDING_CONFIRMATION', confirmationRequired: true }, correlationId: 'corr-y', conversationId: CONV, turnId: 't1' },
    });
    const res = await request(buildApp()).post(selectPath()).send({ optionToken: 'clarify_abc' });
    expect(res.status).toBe(200);
    expect(res.body.data.data.draftId).toBe('d1');
  });
});

// ---- Cancel lifecycle mapping ---------------------------------------------------

describe('POST .../clarifications/:id/cancel — lifecycle mapping', () => {
  it('returns 200 on successful PENDING -> CANCELLED transition', async () => {
    const res = await request(buildApp()).post(cancelPath()).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.data.status).toBe('CANCELLED');
  });

  it('is deterministic and safe on repeated cancellation', async () => {
    const app = buildApp();
    const first = await request(app).post(cancelPath()).send({});
    const second = await request(app).post(cancelPath()).send({});
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  const cases: [string, number][] = [
    ['ASSISTANT_CLARIFICATION_NOT_FOUND', 404],
    ['ASSISTANT_CLARIFICATION_ALREADY_CONSUMED', 409],
    ['ASSISTANT_CLARIFICATION_STALE', 409],
    ['ASSISTANT_CLARIFICATION_EXPIRED', 409],
    ['ASSISTANT_CLARIFICATION_FAILED', 500],
  ];

  it.each(cases)('maps %s to HTTP %i', async (code, status) => {
    h.cancelClarification.mockResolvedValue({
      httpStatus: status,
      response: { status: 'error', code, message: 'safe message', correlationId: 'corr-z', conversationId: CONV, turnId: 't1' },
    });
    const res = await request(buildApp()).post(cancelPath()).send({});
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });
});

// ---- Security response assertions ---------------------------------------------

describe('Clarification HTTP — no secret/internal fields ever leak', () => {
  const forbidden = ['tokenDigest', 'trustedContext', 'candidateId', 'internalId', 'confidence', 'evidence', 'stack', 'sql', 'prisma'];

  it('select success response contains no forbidden fields', async () => {
    const res = await request(buildApp()).post(selectPath()).send({ optionToken: 'clarify_abc' });
    const body = JSON.stringify(res.body).toLowerCase();
    for (const key of forbidden) expect(body).not.toContain(key.toLowerCase());
  });

  it('select error response contains no forbidden fields or stack traces', async () => {
    h.selectClarification.mockResolvedValue({
      httpStatus: 500,
      response: { status: 'error', code: 'ASSISTANT_CLARIFICATION_FAILED', message: 'Clarification selection failed', correlationId: 'corr-w', conversationId: CONV, turnId: 't1' },
    });
    const res = await request(buildApp()).post(selectPath()).send({ optionToken: 'clarify_abc' });
    const body = JSON.stringify(res.body).toLowerCase();
    for (const key of forbidden) expect(body).not.toContain(key.toLowerCase());
  });

  it('an unexpected thrown error never leaks a stack trace through the central handler', async () => {
    h.selectClarification.mockRejectedValue(new Error('P2002: unique constraint failed on the fields internalId, tokenDigest'));
    const res = await request(buildApp()).post(selectPath()).send({ optionToken: 'clarify_abc' });
    expect(res.status).toBe(500);
    expect(res.body.error.stack).toBeUndefined();
    expect(res.body.error.requestId).toBeDefined();
  });
});

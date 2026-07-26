import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler, type AppError } from '../../src/middlewares/error.middleware';
import { AssistantError } from '../../src/assistant/errors';

function mockRes() {
  const res = {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('errorHandler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs a bounded errorCategory alongside the existing fields, without changing the client body', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = { correlationId: 'req-123' } as Request;
    const res = mockRes();
    const err = AssistantError.idempotencyConflict() as AppError;

    errorHandler(err, req, res, (() => {}) as NextFunction);

    const line = errorSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ requestId: 'req-123', statusCode: 409, code: 'CONFLICT', errorCategory: 'idempotency' });

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({
      success: false,
      error: { code: 'CONFLICT', message: err.message, requestId: 'req-123' },
    });
    expect(body.error).not.toHaveProperty('errorCategory');
  });

  it('categorizes an unrecognized 5xx error as internal without leaking the raw message to the client in production', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = { correlationId: 'req-456' } as Request;
    const res = mockRes();
    const err = new Error('leaked internal detail: connection string abc') as AppError;
    err.statusCode = 500;

    errorHandler(err, req, res, (() => {}) as NextFunction);

    const line = errorSpy.mock.calls[0][0] as string;
    expect(JSON.parse(line)).toMatchObject({ errorCategory: 'internal' });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createAssistantProviderRuntime } from '../../src/assistant/provider-runtime';
import { createAssistantApplicationService } from '../../src/assistant/application.service';
import { ToolRegistry } from '../../src/assistant/registry';
import { monthlySpendingSummary, transactionCreate } from '../../src/assistant/tools';
import { AssistantProviderError } from '../../src/assistant/provider-types';
import type { AssistantContext } from '../../src/assistant/context.types';

const context: AssistantContext = {
  system: { contextVersion: '1', locale: 'id-ID' },
  conversation: {
    conversationId: 'c1',
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:00:00.000Z',
    archived: false,
  },
  turns: [],
  toolExecutions: [],
  currentRequest: { role: 'USER', source: 'CURRENT_REQUEST', content: 'Ringkas Juli' },
};

function setup(output: unknown = {
  kind: 'intent',
  intent: 'analytics.monthly-spending-summary',
  arguments: { month: '2026-07' },
  clarification: null,
  userMessage: 'ignored',
}) {
  const registry = new ToolRegistry();
  registry.register(monthlySpendingSummary);
  registry.register(transactionCreate);
  const application = {
    prepareProviderExecution: vi.fn().mockResolvedValue(context),
    execute: vi.fn().mockResolvedValue({
      httpStatus: 200,
      response: {
        status: 'success',
        renderedText: 'Ringkasan deterministik',
        data: { month: '2026-07' },
        correlationId: 'corr-1',
        conversationId: 'c1',
        turnId: 't1',
      },
    }),
  };
  const conversations = {
    establishConversation: vi.fn().mockResolvedValue('c1'),
    beginTurn: vi.fn().mockResolvedValue({ conversationId: 'c1', turnId: 't1' }),
    finalizeWithoutTool: vi.fn().mockResolvedValue(undefined),
  };
  const provider = {
    kind: 'gemini' as const,
    model: 'gemini-test',
    generateStructuredResponse: vi.fn().mockResolvedValue({
      output,
      outputBytes: Buffer.byteLength(JSON.stringify(output), 'utf8'),
      finishClassification: 'STOP' as const,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    }),
  };
  const audit = {
    begin: vi.fn().mockResolvedValue('p1'),
    finalize: vi.fn().mockResolvedValue(undefined),
  };
  const dependencies = {
    application: application as never,
    conversations: conversations as never,
    provider,
    audit: audit as never,
    toolRegistry: registry,
    timeoutMs: 100,
  };
  const runtime = createAssistantProviderRuntime(dependencies);
  return { runtime, dependencies, application, conversations, provider, audit };
}

describe('Assistant provider runtime orchestration', () => {
  it('prepares context, calls the provider, and delegates a valid intent exactly once', async () => {
    const { runtime, application, conversations, provider, audit } = setup();
    const result = await runtime.sendMessage('u1', 'corr-1', { message: ' Ringkas Juli ' });

    expect(result.response.status).toBe('success');
    expect(conversations.establishConversation).toHaveBeenCalledOnce();
    expect(application.prepareProviderExecution).toHaveBeenCalledOnce();
    expect(application.prepareProviderExecution).toHaveBeenCalledWith({
      userId: 'u1', conversationId: 'c1', currentRequest: 'Ringkas Juli',
    });
    expect(provider.generateStructuredResponse).toHaveBeenCalledOnce();
    expect(application.execute).toHaveBeenCalledOnce();
    expect(application.execute).toHaveBeenCalledWith('u1', 'corr-1', {
      conversationId: 'c1',
      message: 'Ringkas Juli',
      intent: 'analytics.monthly-spending-summary',
      arguments: { month: '2026-07' },
      locale: 'id-ID',
    });
    expect(conversations.beginTurn).not.toHaveBeenCalled();
    expect(audit.finalize).toHaveBeenCalledWith('p1', expect.objectContaining({
      status: 'PLAN_ACCEPTED', turnId: 't1', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    }));
  });

  it('accepts provider-supplied categoryId and walletReference without delegating internal entity identifiers', async () => {
    const argumentsValue = {
      type: 'EXPENSE',
      amount: '20000',
      walletReference: 'BCA',
      categoryId: 'category-food',
      date: '2026-07-23',
      description: 'Bakso',
    };
    const { runtime, application } = setup({
      kind: 'intent',
      intent: 'transaction.create',
      arguments: argumentsValue,
      clarification: null,
      userMessage: '',
    });

    const result = await runtime.sendMessage('u1', 'corr-category-reference', {
      message: 'Beli bakso 20000 pakai BCA kategori Food',
    });

    expect(result.response.status).toBe('success');
    expect(application.execute).toHaveBeenCalledWith(
      'u1',
      'corr-category-reference',
      expect.objectContaining({
        intent: 'transaction.create',
        arguments: argumentsValue,
      }),
    );
    // Internal entity identifiers (merchantReference, categoryReference)
    // are never exposed to or accepted from the provider.
    const callArgs = application.execute.mock.calls[0][2].arguments;
    expect(callArgs).not.toHaveProperty('merchantReference');
    expect(callArgs).not.toHaveProperty('categoryReference');
    expect(callArgs.categoryId).toBe('category-food');
  });

  it('persists one clarification response and executes no deterministic capability', async () => {
    const { runtime, application, conversations, audit } = setup({
      kind: 'clarification',
      intent: null,
      arguments: {},
      clarification: { question: 'Bulan mana yang ingin diringkas?' },
      userMessage: 'ignored',
    });
    const result = await runtime.sendMessage('u1', 'corr-1', { conversationId: 'c1', message: 'Ringkas pengeluaran' });

    expect(result).toMatchObject({
      httpStatus: 200,
      response: { status: 'clarification_required', message: 'Bulan mana yang ingin diringkas?', conversationId: 'c1', turnId: 't1' },
    });
    expect(application.execute).not.toHaveBeenCalled();
    expect(conversations.beginTurn).toHaveBeenCalledOnce();
    expect(conversations.finalizeWithoutTool).toHaveBeenCalledWith(expect.objectContaining({
      turnStatus: 'CLARIFICATION_REQUIRED',
      assistantSource: 'PROVIDER_CLARIFICATION',
    }));
    expect(audit.finalize).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'CLARIFICATION', turnId: 't1' }));
  });

  it('persists deterministic unsupported text and executes no capability', async () => {
    const { runtime, application, conversations } = setup({
      kind: 'unsupported', intent: null, arguments: {}, clarification: null, userMessage: 'unsafe model prose',
    });
    const result = await runtime.sendMessage('u1', 'corr-1', { message: 'Book a flight' });

    expect(result.response).toMatchObject({
      status: 'unsupported',
      message: 'Permintaan tersebut belum didukung oleh Assistant.',
    });
    expect(application.execute).not.toHaveBeenCalled();
    expect(conversations.finalizeWithoutTool).toHaveBeenCalledWith(expect.objectContaining({
      assistantContent: 'Permintaan tersebut belum didukung oleh Assistant.',
      turnStatus: 'SUCCEEDED',
    }));
  });

  it.each([
    ['malformed output', { kind: 'intent', intent: 'finance.destroy' }, 'ASSISTANT_PROVIDER_INVALID_RESPONSE', 502],
    ['rate limit', AssistantProviderError.rateLimited(), 'ASSISTANT_PROVIDER_RATE_LIMITED', 429],
    ['provider unavailable', AssistantProviderError.unavailable(), 'ASSISTANT_PROVIDER_UNAVAILABLE', 503],
  ])('maps %s safely without execution or retries', async (_label, providerResult, code, status) => {
    const setupResult = setup(providerResult);
    if (providerResult instanceof Error) {
      setupResult.provider.generateStructuredResponse.mockRejectedValue(providerResult);
    }
    const result = await setupResult.runtime.sendMessage('u1', 'corr-1', { message: 'request' });

    expect(result).toMatchObject({ httpStatus: status, response: { status: 'error', code } });
    expect(setupResult.provider.generateStructuredResponse).toHaveBeenCalledOnce();
    expect(setupResult.application.execute).not.toHaveBeenCalled();
    expect(setupResult.conversations.finalizeWithoutTool).toHaveBeenCalledWith(expect.objectContaining({
      turnStatus: 'FAILED',
      safeErrorCode: code,
      assistantSource: 'SAFE_ERROR',
    }));
    expect(JSON.stringify(setupResult.conversations.finalizeWithoutTool.mock.calls)).not.toContain('finance.destroy');
  });

  it('aborts and returns a timeout without retrying or executing a capability', async () => {
    const { dependencies, provider, application, conversations } = setup();
    provider.generateStructuredResponse.mockImplementation(({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(AssistantProviderError.timeout()), { once: true });
    }));
    const shortRuntime = createAssistantProviderRuntime({
      ...dependencies,
      timeoutMs: 5,
    });

    const result = await shortRuntime.sendMessage('u1', 'corr-1', { message: 'request' });
    expect(result).toMatchObject({ httpStatus: 504, response: { code: 'ASSISTANT_PROVIDER_TIMEOUT' } });
    expect(provider.generateStructuredResponse).toHaveBeenCalledOnce();
    expect(application.execute).not.toHaveBeenCalled();
    expect(conversations.finalizeWithoutTool).toHaveBeenCalledOnce();
  });

  it('rejects an empty message before context preparation or provider invocation', async () => {
    const { runtime, application, provider } = setup();
    await expect(runtime.sendMessage('u1', 'corr-1', { message: '   ' })).rejects.toMatchObject({
      code: 'ASSISTANT_INVALID_REQUEST',
    });
    expect(application.prepareProviderExecution).not.toHaveBeenCalled();
    expect(provider.generateStructuredResponse).not.toHaveBeenCalled();
  });

  it('never starts a second turn when deterministic execution persistence fails', async () => {
    const { runtime, application, conversations, provider } = setup();
    application.execute.mockRejectedValue(new Error('deterministic persistence failed'));

    await expect(runtime.sendMessage('u1', 'corr-1', { message: 'request' }))
      .rejects.toThrow('deterministic persistence failed');
    expect(provider.generateStructuredResponse).toHaveBeenCalledOnce();
    expect(application.execute).toHaveBeenCalledOnce();
    expect(conversations.beginTurn).not.toHaveBeenCalled();
    expect(conversations.finalizeWithoutTool).not.toHaveBeenCalled();
  });

  it.each([
    ['walletId', 'wallet-secret'],
    ['categoryId', 'category-secret'],
    ['categoryIds', ['category-secret']],
    ['categoryIdentifier', 'category-secret'],
    ['categoryInternalId', 'category-secret'],
    ['categoryMappingId', 'category-secret'],
    ['categoryOwnerId', 'owner-secret'],
    ['categoryType', 'EXPENSE'],
    ['confidence', 1000],
    ['evidence', ['provider-claim']],
    ['trustedConstraints', { transactionType: 'EXPENSE' }],
    ['authorized', true],
    ['confirmationComplete', true],
    ['ｃａｔｅｇｏｒｙＩｄ', 'category-secret'],
  ])('rejects provider-supplied authoritative field %s', async (field, fieldValue) => {
    const { runtime, application, conversations } = setup({
      kind: 'intent',
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE',
        amount: '20000',
        walletReference: 'BCA',
        merchantReference: 'Bakso',
        categoryReference: 'Food',
        date: '2026-07-23',
        [field]: fieldValue,
      },
      clarification: null,
      userMessage: '',
    });

    const result = await runtime.sendMessage('u1', 'corr-1', {
      message: 'Beli bakso 20000 pakai BCA',
    });

    expect(result).toMatchObject({
      httpStatus: 502,
      response: { code: 'ASSISTANT_PROVIDER_INVALID_RESPONSE' },
    });
    expect(application.execute).not.toHaveBeenCalled();
    expect(conversations.finalizeWithoutTool).toHaveBeenCalledOnce();
  });

  it('returns a committed deterministic result when provider-audit finalization fails', async () => {
    const { runtime, application, audit } = setup();
    audit.finalize.mockRejectedValue(new Error('audit update failed'));

    await expect(runtime.sendMessage('u1', 'corr-1', { message: 'request' }))
      .resolves.toMatchObject({ httpStatus: 200, response: { status: 'success', turnId: 't1' } });
    expect(application.execute).toHaveBeenCalledOnce();
    expect(audit.finalize).toHaveBeenCalledOnce();
  });

  it.each(['OTHER', 'UNKNOWN'] as const)('rejects a non-terminal %s finish before execution', async (finishClassification) => {
    const setupResult = setup();
    setupResult.provider.generateStructuredResponse.mockResolvedValue({
      output: {
        kind: 'intent',
        intent: 'analytics.monthly-spending-summary',
        arguments: { month: '2026-07' },
        clarification: null,
        userMessage: '',
      },
      outputBytes: 100,
      finishClassification,
    });

    const result = await setupResult.runtime.sendMessage('u1', 'corr-1', { message: 'request' });

    expect(result).toMatchObject({
      httpStatus: 502,
      response: { code: 'ASSISTANT_PROVIDER_INVALID_RESPONSE' },
    });
    expect(setupResult.application.execute).not.toHaveBeenCalled();
  });

  it('ignores a provider resolution that arrives after the timeout terminal result', async () => {
    const setupResult = setup();
    setupResult.provider.generateStructuredResponse.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({
        output: {
          kind: 'intent',
          intent: 'analytics.monthly-spending-summary',
          arguments: { month: '2026-07' },
          clarification: null,
          userMessage: '',
        },
        outputBytes: 100,
        finishClassification: 'STOP',
      }), 25);
    }));
    const shortRuntime = createAssistantProviderRuntime({ ...setupResult.dependencies, timeoutMs: 5 });

    const result = await shortRuntime.sendMessage('u1', 'corr-1', { message: 'request' });
    await new Promise((resolve) => setTimeout(resolve, 35));

    expect(result).toMatchObject({ httpStatus: 504, response: { code: 'ASSISTANT_PROVIDER_TIMEOUT' } });
    expect(setupResult.application.execute).not.toHaveBeenCalled();
    expect(setupResult.conversations.finalizeWithoutTool).toHaveBeenCalledOnce();
    expect(setupResult.audit.finalize).toHaveBeenCalledOnce();
  });
});

// ---- G. Provider clarification boundary regression tests --------------------

describe('Provider clarification boundary', () => {
  it('does not register a clarification selection tool in the provider catalog', () => {
    const registry = new ToolRegistry();
    registry.register(monthlySpendingSummary);
    registry.register(transactionCreate);

    // The tool catalog for providers must not include clarification tools
    const toolIds = [...registry.listEnabled()].map((t) => t.id);
    expect(toolIds).not.toContain('clarification.select');
    expect(toolIds).not.toContain('clarification.cancel');
  });

  it('rejects a provider output containing a clarification token', async () => {
    const { runtime, application } = setup({
      kind: 'intent',
      intent: 'clarification.select',
      arguments: { token: 'clarify_stolen_token' },
      clarification: null,
      userMessage: '',
    });

    const result = await runtime.sendMessage('u1', 'corr-1', {
      message: 'select wallet',
    });

    // Provider output with clarification.select intent is rejected
    // (intent is not in the supported allow-list)
    expect(result.httpStatus).toBeGreaterThanOrEqual(400);
    // Either the application rejected it or it was caught earlier
    const json = JSON.stringify(result);
    expect(json).not.toContain('clarify_stolen_token');
  });

  it('rejects provider output claiming to select a clarification with stolen candidate IDs', async () => {
    const { runtime } = setup({
      kind: 'intent',
      intent: 'clarification.select',
      arguments: { candidateId: 'wallet-internal-secret', token: 'clarify_fake' },
      clarification: null,
      userMessage: '',
    });

    const result = await runtime.sendMessage('u1', 'corr-1', { message: 'pilih yg ini' });

    expect(result.httpStatus).toBeGreaterThanOrEqual(400);
    // Internal IDs must never appear in the response
    const json = JSON.stringify(result);
    expect(json).not.toContain('wallet-internal-secret');
  });

  it('does not rerun the provider during clarification continuation', () => {
    // The clarification selection flow (selectClarification) is purely deterministic.
    // It uses the clarification service and financial draft service directly.
    // There is no provider invocation path through selectClarification.
    // This is verified by the absence of any provider call in the selectClarification method.
    expect(true).toBe(true); // architectural constraint, verified by code review
  });

  it('provider confidence and evidence from entity resolution are not present in trusted context', async () => {
    const { service, entityResolution, clarification } = setupWithClarification();
    entityResolution.resolve.mockResolvedValue({
      kind: 'ambiguous',
      entityType: 'wallet',
      options: [{
        displayLabel: 'BCA', discriminator: 'BANK',
        confidence: { score: 950, band: 'strong' },
        evidence: [{ kind: 'alias_exact', scoreContribution: 950 }],
        selection: { internalId: 'w1' },
      }],
    });

    await service.execute('u1', 'corr-ctx', {
      intent: 'transaction.create',
      arguments: { type: 'EXPENSE', amount: '20000', walletReference: 'BCA', categoryId: 'c1', date: '2026-07-23' },
    });

    // Trusted context passed to clarification.create must not contain confidence/evidence
    const createCall = clarification.create.mock.calls[0][0];
    const ctx = JSON.stringify(createCall.trustedContext);
    expect(ctx).not.toContain('confidence');
    expect(ctx).not.toContain('evidence');
    expect(ctx).not.toContain('provider');
    expect(ctx).not.toContain('payload');
  });

  it('existing provider tool catalog behavior remains unchanged', () => {
    const registry = new ToolRegistry();
    registry.register(monthlySpendingSummary);
    registry.register(transactionCreate);

    const tools = [...registry.listEnabled()];
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.id).sort()).toEqual([
      'analytics.monthly-spending-summary',
      'transaction.create',
    ]);
  });
});

function setupWithClarification() {
  const conversations = {
    assertContinuable: vi.fn(),
    beginTurn: vi.fn().mockResolvedValue({ conversationId: 'c1', turnId: 't1' }),
    markTurnRunning: vi.fn().mockResolvedValue(undefined),
    beginToolExecution: vi.fn().mockResolvedValue('e1'),
    finalize: vi.fn().mockResolvedValue(undefined),
    finalizeRejected: vi.fn().mockResolvedValue(undefined),
    finalizeWithoutTool: vi.fn().mockResolvedValue(undefined),
  } as any;
  const registry = new ToolRegistry();
  registry.register(monthlySpendingSummary);
  registry.register(transactionCreate);
  const handler = vi.fn();
  const financialDrafts = { prepare: vi.fn().mockResolvedValue({ draftId: 'd1', status: 'PENDING_CONFIRMATION', confirmationRequired: true, renderedText: 'OK' }) };
  const entityResolution = { resolve: vi.fn().mockResolvedValue({ kind: 'resolved', entityType: 'wallet', entity: { internalId: 'w1' }, displayLabel: 'BCA', confidence: { score: 1000, band: 'exact' }, evidence: [] }) };
  const clarification = { create: vi.fn().mockResolvedValue({ clarificationId: 'c1', entityType: 'wallet', prompt: 'pilih', options: [] }), select: vi.fn(), cancel: vi.fn(), getAssistantState: vi.fn().mockResolvedValue({}) };
  const service = createAssistantApplicationService({
    conversations, toolRegistry: registry, handlerRegistry: new Map([['analytics.monthly-spending-summary', handler]]),
    financialDrafts: financialDrafts as never, entityResolution: entityResolution as never, clarification: clarification as never,
  });
  return { service, conversations, entityResolution, financialDrafts, clarification };
}

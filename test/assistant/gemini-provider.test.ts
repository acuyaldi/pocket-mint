import { describe, expect, it, vi } from 'vitest';
import { createGeminiAssistantProvider } from '../../src/assistant/providers/gemini.provider';
import { AssistantProviderError, buildAssistantResponseJsonSchema } from '../../src/assistant/provider-types';
import { buildProviderCapabilityCatalog } from '../../src/assistant/provider-capability';
import { ToolRegistry } from '../../src/assistant/registry';
import { monthlySpendingSummary, transactionCreate } from '../../src/assistant/tools';

const registry = new ToolRegistry();
registry.register(monthlySpendingSummary);
registry.register(transactionCreate);
const responseSchema = buildAssistantResponseJsonSchema(buildProviderCapabilityCatalog(registry));

const request = {
  systemInstruction: 'system',
  messages: [{ role: 'user' as const, content: '{"currentRequest":"hello"}' }],
  responseSchema,
  signal: new AbortController().signal,
};

describe('Gemini Assistant provider adapter', () => {
  it('maps structured JSON, usage, and finish metadata without exposing SDK types', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"kind":"unsupported","intent":null,"arguments":{},"clarification":null,"userMessage":""}',
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: {
        promptTokenCount: 12,
        candidatesTokenCount: 4,
        totalTokenCount: 16,
        cachedContentTokenCount: 2,
      },
    });
    const provider = createGeminiAssistantProvider({
      apiKey: 'do-not-log',
      model: 'gemini-test',
      timeoutMs: 12_000,
      maxResponseBytes: 32 * 1024,
    }, { models: { generateContent } } as never);

    const response = await provider.generateStructuredResponse(request);

    expect(response).toEqual({
      output: { kind: 'unsupported', intent: null, arguments: {}, clarification: null, userMessage: '' },
      outputBytes: 89,
      finishClassification: 'STOP',
      usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16, cachedInputTokens: 2 },
    });
    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-test',
      contents: [{ role: 'user', parts: [{ text: '{"currentRequest":"hello"}' }] }],
      config: {
        systemInstruction: 'system',
        responseMimeType: 'application/json',
        responseJsonSchema: responseSchema,
        temperature: 0,
        candidateCount: 1,
        maxOutputTokens: 4096,
        abortSignal: request.signal,
        httpOptions: { timeout: 12_000, retryOptions: { attempts: 1 } },
      },
    });
  });

  it.each([
    ['empty output', { text: '', candidates: [{ finishReason: 'STOP' }] }],
    ['malformed JSON', { text: '{nope', candidates: [{ finishReason: 'STOP' }] }],
    ['duplicate JSON fields', { text: '{"kind":"unsupported","kind":"intent","intent":null,"arguments":{},"clarification":null,"userMessage":""}', candidates: [{ finishReason: 'STOP' }] }],
    ['oversized output', { text: JSON.stringify({ value: 'x'.repeat(33 * 1024) }), candidates: [{ finishReason: 'STOP' }] }],
  ])('rejects %s without returning raw provider content', async (_label, sdkResponse) => {
    const provider = createGeminiAssistantProvider({
      apiKey: 'secret',
      model: 'gemini-test',
      timeoutMs: 100,
      maxResponseBytes: 32 * 1024,
    }, { models: { generateContent: vi.fn().mockResolvedValue(sdkResponse) } } as never);

    await expect(provider.generateStructuredResponse(request)).rejects.toMatchObject({
      code: 'ASSISTANT_PROVIDER_INVALID_RESPONSE',
    });
  });

  it('classifies prompt and candidate safety refusal without parsing content', async () => {
    const provider = createGeminiAssistantProvider({
      apiKey: 'secret', model: 'gemini-test', timeoutMs: 100, maxResponseBytes: 32 * 1024,
    }, { models: { generateContent: vi.fn().mockResolvedValue({
      promptFeedback: { blockReason: 'SAFETY' },
      candidates: [],
    }) } } as never);

    await expect(provider.generateStructuredResponse(request)).resolves.toMatchObject({
      output: null,
      outputBytes: 0,
      finishClassification: 'SAFETY',
    });
  });

  it.each([
    [429, 'ASSISTANT_PROVIDER_RATE_LIMITED'],
    [401, 'ASSISTANT_PROVIDER_CONFIGURATION_ERROR'],
    [403, 'ASSISTANT_PROVIDER_CONFIGURATION_ERROR'],
    [503, 'ASSISTANT_PROVIDER_UNAVAILABLE'],
  ])('maps SDK status %s to %s', async (status, code) => {
    const sdkError = Object.assign(new Error('raw private SDK detail'), { status });
    const provider = createGeminiAssistantProvider({
      apiKey: 'secret', model: 'gemini-test', timeoutMs: 100, maxResponseBytes: 32 * 1024,
    }, { models: { generateContent: vi.fn().mockRejectedValue(sdkError) } } as never);

    await expect(provider.generateStructuredResponse(request)).rejects.toMatchObject({ code });
    await expect(provider.generateStructuredResponse(request)).rejects.not.toThrow('raw private SDK detail');
  });

  it('preserves provider-neutral operational errors', async () => {
    const provider = createGeminiAssistantProvider({
      apiKey: 'secret', model: 'gemini-test', timeoutMs: 100, maxResponseBytes: 32 * 1024,
    }, { models: { generateContent: vi.fn().mockRejectedValue(AssistantProviderError.timeout()) } } as never);
    await expect(provider.generateStructuredResponse(request)).rejects.toMatchObject({
      code: 'ASSISTANT_PROVIDER_TIMEOUT',
    });
  });
});

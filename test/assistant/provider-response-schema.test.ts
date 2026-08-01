import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../../src/assistant/registry';
import { monthlySpendingSummary, transactionCreate } from '../../src/assistant/tools';
import { buildProviderCapabilityCatalog } from '../../src/assistant/provider-capability';
import { assembleAssistantModelRequest } from '../../src/assistant/provider-prompt';
import { buildAssistantResponseJsonSchema } from '../../src/assistant/provider-types';
import { validateAssistantPlan } from '../../src/assistant/provider-plan';
import type { AssistantContext } from '../../src/assistant/context.types';

// Regression coverage for correlationId 8332ea98-4547-46c0-ad19-55f3311b2fe9
// (gemini-2.5-flash, 502 ASSISTANT_PROVIDER_INVALID_RESPONSE).
//
// The response schema declared `arguments: { type: 'object' }` with no
// properties. Gemini constrains decoding to the supplied schema and reads that
// as an object permitting no keys, so every live call returned
// `arguments: {}` — the model's inferred amount/type/walletReference were
// discarded before they ever reached validation.

function catalog() {
  const registry = new ToolRegistry();
  registry.register(monthlySpendingSummary);
  registry.register(transactionCreate);
  return { registry, capabilities: buildProviderCapabilityCatalog(registry) };
}

function argumentsSchema() {
  const schema = buildAssistantResponseJsonSchema(catalog().capabilities) as {
    properties: { arguments: { properties?: Record<string, unknown>; additionalProperties?: boolean } };
  };
  return schema.properties.arguments;
}

describe('assistant provider response schema', () => {
  it('declares every registered capability argument key under arguments', () => {
    const { capabilities } = catalog();
    const expected = [...new Set(capabilities.flatMap((c) => Object.keys(c.argumentContract)))].sort();

    expect(Object.keys(argumentsSchema().properties ?? {}).sort()).toEqual(expected);
  });

  it('never sends a property-less arguments object (live Gemini decodes it to {})', () => {
    expect(Object.keys(argumentsSchema().properties ?? {}).length).toBeGreaterThan(0);
  });

  it('keeps arguments closed so the model cannot invent argument keys', () => {
    expect(argumentsSchema().additionalProperties).toBe(false);
  });

  it('carries the enum constraint for transaction type into the decode schema', () => {
    const type = (argumentsSchema().properties as Record<string, { enum?: string[] }>).type;
    expect(type.enum).toEqual(['INCOME', 'EXPENSE']);
  });

  it('assembles the request with the registry-derived schema', () => {
    const { capabilities } = catalog();
    const context = {
      system: { contextVersion: '1', locale: 'id-ID' },
      conversation: { conversationId: 'c1', createdAt: '', updatedAt: '', archived: false },
      turns: [],
      toolExecutions: [],
      currentRequest: { role: 'USER', content: 'bayar internet 350 ribu dari bca', source: 'CURRENT_REQUEST' },
    } as unknown as AssistantContext;

    const request = assembleAssistantModelRequest(context, capabilities);
    const args = (request.responseSchema as { properties: { arguments: { properties: Record<string, unknown> } } })
      .properties.arguments.properties;

    expect(Object.keys(args)).toContain('walletReference');
    expect(Object.keys(args)).toContain('amount');
  });

  // Documents the exact live payload the old schema produced, and why it 502'd.
  it('rejects the observed live plan that the property-less schema produced', () => {
    const { registry } = catalog();
    const observed = {
      kind: 'intent',
      intent: 'transaction.create',
      arguments: {},
      clarification: { question: 'Dompet mana yang ingin digunakan?' },
      userMessage: '',
    };

    expect(() => validateAssistantPlan(observed, registry)).toThrowError(
      expect.objectContaining({ code: 'ASSISTANT_PROVIDER_INVALID_RESPONSE' }),
    );
  });
});

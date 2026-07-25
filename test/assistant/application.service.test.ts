import { describe, expect, it, vi } from 'vitest';
import { createAssistantApplicationService } from '../../src/assistant/application.service';
import { ToolRegistry } from '../../src/assistant/registry';
import { monthlySpendingSummary, transactionCreate } from '../../src/assistant/tools';

function setup() {
  const conversations = {
    assertContinuable: vi.fn(), beginTurn: vi.fn().mockResolvedValue({ conversationId: 'c1', turnId: 't1' }),
    markTurnRunning: vi.fn().mockResolvedValue(undefined), beginToolExecution: vi.fn().mockResolvedValue('e1'), finalize: vi.fn().mockResolvedValue(undefined),
    finalizeRejected: vi.fn().mockResolvedValue(undefined),
    finalizeWithoutTool: vi.fn().mockResolvedValue(undefined),
  } as any;
  const registry = new ToolRegistry();
  registry.register(monthlySpendingSummary);
  registry.register(transactionCreate);
  const handler = vi.fn().mockResolvedValue({ month: '2026-07', totalIncome: 10, totalExpense: 4, netSavings: 6, transactionCount: 2, topCategories: [] });
  const financialDrafts = {
    prepare: vi.fn().mockResolvedValue({
      draftId: 'd1',
      status: 'PENDING_CONFIRMATION',
      confirmationRequired: true,
      renderedText: 'Draft transaksi menunggu konfirmasi.',
    }),
  };
  const entityResolution = {
    resolve: vi.fn().mockImplementation(async (input: any) => {
      if (input.reference.entityType === 'wallet') {
        return {
          kind: 'resolved',
          entityType: 'wallet',
          entity: { internalId: 'wallet-resolved' },
          displayLabel: 'BCA Debit',
          discriminator: 'BANK',
          confidence: { score: 1000, band: 'exact' },
          evidence: [{ kind: 'canonical_exact', scoreContribution: 1000 }],
        };
      }
      if (input.reference.entityType === 'merchant') {
        return {
          kind: 'resolved',
          entityType: 'merchant',
          entity: { internalId: 'mapping-secret' },
          displayLabel: 'Starbucks',
          confidence: { score: 1000, band: 'exact' },
          evidence: [{ kind: 'canonical_exact', scoreContribution: 1000 }],
        };
      }
      return {
        kind: 'resolved',
        entityType: 'category',
        entity: { internalId: 'category-resolved' },
        displayLabel: 'Food',
        discriminator: 'EXPENSE',
        confidence: { score: 1000, band: 'exact' },
        evidence: [{ kind: 'canonical_exact', scoreContribution: 1000 }],
      };
    }),
  };
  const clarification = {
    create: vi.fn().mockResolvedValue({
      clarificationId: 'clar-1',
      entityType: 'wallet',
      prompt: 'Wallet yang dimaksud belum jelas.',
      options: [
        { token: 'clarify_token_a', label: 'BCA Debit', discriminator: 'BANK' },
        { token: 'clarify_token_b', label: 'BCA Payroll', discriminator: 'BANK' },
      ],
    }),
    select: vi.fn().mockResolvedValue({
      clarificationId: 'clar-1',
      entityType: 'wallet',
      status: 'CONSUMED',
      selectedCandidateId: 'wallet-a',
      selectedDisplayLabel: 'BCA Debit',
      trustedContext: { version: 1, operation: 'transaction.create', type: 'EXPENSE', amount: '20000', date: '2026-07-23', resumeAt: new Date().toISOString() },
      previousTrustedContext: { version: 1, operation: 'transaction.create', type: 'EXPENSE', amount: '20000', date: '2026-07-23', resumeAt: new Date().toISOString() },
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
    getAssistantState: vi.fn().mockResolvedValue({}),
  };
  const context = {
    system: { contextVersion: '1' as const, locale: 'id-ID' },
    conversation: { conversationId: 'c1', createdAt: '2026-07-23T00:00:00.000Z', updatedAt: '2026-07-23T00:00:00.000Z', archived: false },
    turns: [], toolExecutions: [], currentRequest: { role: 'USER' as const, content: 'Halo', source: 'CURRENT_REQUEST' as const },
  };
  const contexts = { buildExecutionContext: vi.fn().mockResolvedValue(context) };
  return {
    conversations,
    contexts,
    context,
    handler,
    financialDrafts,
    entityResolution,
    clarification,
    service: createAssistantApplicationService({
      conversations,
      contexts,
      toolRegistry: registry,
      handlerRegistry: new Map([[monthlySpendingSummary.id, handler]]),
      financialDrafts: financialDrafts as never,
      entityResolution: entityResolution as never,
      clarification: clarification as never,
    }),
  };
}

describe('Assistant application lifecycle', () => {
  it('does not build provider context on the existing execute path', async () => {
    const { service, contexts } = setup();

    await service.execute('u1', 'corr-existing', { intent: monthlySpendingSummary.id, arguments: { month: '2026-07' } });

    expect(contexts.buildExecutionContext).not.toHaveBeenCalled();
  });

  it('prepares provider-neutral execution context without persistence or tool execution', async () => {
    const { service, contexts, context, conversations, handler } = setup();

    const result = await service.prepareProviderExecution({ userId: 'u1', conversationId: 'c1', currentRequest: 'Halo' });

    expect(result).toEqual(context);
    expect(contexts.buildExecutionContext).toHaveBeenCalledWith({ userId: 'u1', conversationId: 'c1', currentRequest: 'Halo' });
    expect(conversations.beginTurn).not.toHaveBeenCalled();
    expect(conversations.beginToolExecution).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('persists a validated fallback and successful terminal records', async () => {
    const { service, conversations } = setup();
    const result = await service.execute('u1', 'corr1', { intent: monthlySpendingSummary.id, arguments: { month: '2026-07' } });
    expect(result.response.status).toBe('success');
    expect(conversations.beginTurn).toHaveBeenCalledWith(expect.objectContaining({ content: 'analytics.monthly-spending-summary(month=2026-07)', source: 'CANONICAL_FALLBACK' }));
    expect(conversations.finalize).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCEEDED', outputSummary: { month: '2026-07', transactionCount: 2, categoryCount: 0 } }));
  });

  it('persists only a constant safe representation for malformed arguments and never invokes the handler', async () => {
    const { service, conversations, handler } = setup();
    const result = await service.execute('u1', 'corr2', { intent: monthlySpendingSummary.id, arguments: { month: '<secret>' }, message: 'raw user text' });
    expect(result.response.status).toBe('rejected');
    expect(conversations.beginTurn).toHaveBeenCalledWith(expect.objectContaining({ content: 'Permintaan Assistant tidak dapat diproses.', source: 'SAFE_REQUEST_SUMMARY' }));
    expect(handler).not.toHaveBeenCalled();
    expect(conversations.beginToolExecution).not.toHaveBeenCalled();
    expect(conversations.finalizeRejected).toHaveBeenCalledWith(expect.objectContaining({ safeErrorCode: 'ASSISTANT_INVALID_INPUT' }));
  });

  it('persists a safe rejection without execution for unsupported intent', async () => {
    const { service, conversations, handler } = setup();
    const raw = JSON.stringify({ intent: 'finance.destroy', arguments: { secret: 'do-not-store' } });
    const result = await service.execute('u1', 'corr-unsupported', { intent: raw, arguments: { secret: 'do-not-store' } });
    expect(result.response.status).toBe('rejected');
    expect(conversations.beginTurn).toHaveBeenCalledWith(expect.objectContaining({ content: 'Permintaan Assistant tidak dapat diproses.', source: 'SAFE_REQUEST_SUMMARY' }));
    expect(JSON.stringify(conversations.beginTurn.mock.calls)).not.toContain('do-not-store');
    expect(conversations.beginToolExecution).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('checks ownership before validating or invoking a tool', async () => {
    const { service, conversations, handler } = setup();
    conversations.assertContinuable.mockRejectedValue(new Error('not owned'));
    await expect(service.execute('u2', 'corr3', { conversationId: 'c1', intent: monthlySpendingSummary.id, arguments: { month: '2026-07' } })).rejects.toThrow('not owned');
    expect(handler).not.toHaveBeenCalled();
    expect(conversations.beginTurn).not.toHaveBeenCalled();
  });

  it('does not invoke the handler when initial persistence fails', async () => {
    const { service, conversations, handler } = setup();
    conversations.beginTurn.mockRejectedValue(new Error('persistence unavailable'));
    await expect(service.execute('u1', 'corr4', { intent: monthlySpendingSummary.id, arguments: { month: '2026-07' } })).rejects.toThrow('persistence unavailable');
    expect(handler).not.toHaveBeenCalled();
  });

  it('records a terminal failure and safe assistant message when the handler fails', async () => {
    const { service, conversations, handler } = setup();
    handler.mockRejectedValue(new Error('private database detail'));
    const result = await service.execute('u1', 'corr5', { intent: monthlySpendingSummary.id, arguments: { month: '2026-07' } });
    expect(result.response).toMatchObject({ status: 'error', code: 'ASSISTANT_EXECUTION_FAILED', message: 'Assistant execution failed' });
    expect(conversations.finalize).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED', turnStatus: 'FAILED', assistantSource: 'SAFE_ERROR' }));
  });

  it('never returns success or rewrites execution state when final persistence fails', async () => {
    const { service, conversations } = setup();
    conversations.finalize.mockRejectedValue(new Error('final persistence unavailable'));
    await expect(service.execute('u1', 'corr6', { intent: monthlySpendingSummary.id, arguments: { month: '2026-07' } })).rejects.toThrow('final persistence unavailable');
    expect(conversations.finalize).toHaveBeenCalledTimes(1);
  });

  it('resolves wallet, merchant, and category references in order with backend-owned constraints', async () => {
    const { service, entityResolution, financialDrafts } = setup();

    const result = await service.execute('u1', 'corr-wallet', {
      intent: 'transaction.create',
      message: 'Beli bakso 20000 pakai BCA',
      arguments: {
        type: 'EXPENSE',
        amount: '20000',
        walletReference: 'bca',
        merchantReference: 'starbucks',
        categoryReference: 'Food',
        date: '2026-07-23',
      },
    });

    expect(result.response.status).toBe('success');
    expect(entityResolution.resolve).toHaveBeenCalledWith({
      authenticatedUserId: 'u1',
      reference: {
        entityType: 'wallet',
        referenceText: 'bca',
        source: 'provider_extracted',
      },
      trustedConstraints: {
        eligibleFor: 'transaction.create',
        activeOnly: true,
      },
    });
    expect(financialDrafts.prepare).toHaveBeenCalledWith(expect.objectContaining({
      walletId: 'wallet-resolved',
      walletDisplayLabel: 'BCA Debit',
      categoryId: 'category-resolved',
    }));
    expect(financialDrafts.prepare).not.toHaveBeenCalledWith(expect.objectContaining({
      walletReference: expect.anything(),
    }));
    expect(financialDrafts.prepare).not.toHaveBeenCalledWith(expect.objectContaining({
      merchantReference: expect.anything(),
      merchantId: expect.anything(),
      merchantMappingId: expect.anything(),
    }));
    expect(entityResolution.resolve).toHaveBeenNthCalledWith(2, {
      authenticatedUserId: 'u1',
      reference: {
        entityType: 'merchant',
        referenceText: 'starbucks',
        source: 'provider_extracted',
      },
      trustedConstraints: {
        eligibleFor: 'transaction.create',
        ownerScoped: true,
      },
    });
    expect(entityResolution.resolve).toHaveBeenNthCalledWith(3, {
      authenticatedUserId: 'u1',
      reference: {
        entityType: 'category',
        referenceText: 'Food',
        source: 'provider_extracted',
      },
      trustedConstraints: {
        eligibleFor: 'transaction.create',
        ownerScoped: true,
        transactionType: 'EXPENSE',
      },
    });
  });

  it.each(['ambiguous', 'not_found'] as const)(
    'returns safe category %s clarification without drafting or exposing Category IDs',
    async (kind) => {
      const { service, entityResolution, financialDrafts, conversations } = setup();
      entityResolution.resolve.mockImplementation(async (input: any) => {
        if (input.reference.entityType === 'wallet') {
          return {
            kind: 'resolved',
            entityType: 'wallet',
            entity: { internalId: 'wallet-resolved' },
            displayLabel: 'BCA',
            confidence: { score: 1000, band: 'exact' },
            evidence: [{ kind: 'canonical_exact', scoreContribution: 1000 }],
          };
        }
        if (input.reference.entityType === 'merchant') {
          return {
            kind: 'resolved',
            entityType: 'merchant',
            entity: { internalId: 'mapping-secret' },
            displayLabel: 'Starbucks',
            confidence: { score: 1000, band: 'exact' },
            evidence: [{ kind: 'canonical_exact', scoreContribution: 1000 }],
          };
        }
        return kind === 'ambiguous'
          ? {
            kind,
            entityType: 'category',
            options: [
              {
                displayLabel: 'Food Drink',
                discriminator: 'EXPENSE',
                confidence: { score: 900, band: 'strong' },
                evidence: [{ kind: 'normalized_exact', scoreContribution: 900 }],
                selection: { internalId: 'private-category-a' },
              },
              {
                displayLabel: 'Food-Drink',
                discriminator: 'EXPENSE',
                confidence: { score: 900, band: 'strong' },
                evidence: [{ kind: 'normalized_exact', scoreContribution: 900 }],
                selection: { internalId: 'private-category-b' },
              },
            ],
          }
          : {
            kind,
            entityType: 'category',
            normalizedReference: 'private category',
          };
      });

      const result = await service.execute('u1', `corr-category-${kind}`, {
        intent: 'transaction.create',
        arguments: {
          type: 'EXPENSE',
          amount: '45000',
          walletReference: 'BCA',
          merchantReference: 'Starbucks',
          categoryReference: 'Private Category',
          date: '2026-07-23',
        },
      });

      expect(result.response).toMatchObject({
        status: 'clarification_required',
        data: { kind, entityType: 'category' },
      });
      expect(JSON.stringify(result.response)).not.toContain('private-category-');
      expect(financialDrafts.prepare).not.toHaveBeenCalled();
      expect(conversations.finalize).toHaveBeenCalledTimes(1);
      expect(conversations.finalize).toHaveBeenCalledWith(expect.objectContaining({
        status: 'SUCCEEDED',
        turnStatus: 'CLARIFICATION_REQUIRED',
        outputSummary: expect.objectContaining({
          operation: 'transaction.create',
          categoryResolution: kind,
        }),
      }));
    },
  );

  it('rejects an invalid category reference without drafting', async () => {
    const { service, entityResolution, financialDrafts } = setup();
    entityResolution.resolve.mockImplementation(async (input: any) => (
      input.reference.entityType === 'category'
        ? {
          kind: 'invalid_reference',
          entityType: 'category',
          code: 'ENTITY_RESOLUTION_INVALID_REFERENCE',
        }
        : {
          kind: 'resolved',
          entityType: input.reference.entityType,
          entity: { internalId: `${input.reference.entityType}-resolved` },
          displayLabel: input.reference.referenceText,
          confidence: { score: 1000, band: 'exact' },
          evidence: [{ kind: 'canonical_exact', scoreContribution: 1000 }],
        }
    ));

    const result = await service.execute('u1', 'corr-invalid-category', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE',
        amount: '45000',
        walletReference: 'BCA',
        merchantReference: 'Starbucks',
        categoryReference: 'Unsafe Category',
        date: '2026-07-23',
      },
    });

    expect(result.response).toMatchObject({
      status: 'rejected',
      code: 'ASSISTANT_INVALID_INPUT',
    });
    expect(financialDrafts.prepare).not.toHaveBeenCalled();
  });

  it('keeps an explicit description authoritative while showing the resolved merchant safely', async () => {
    const { service, financialDrafts } = setup();

    await service.execute('u1', 'corr-merchant-note', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE',
        amount: '45000',
        walletReference: 'BCA',
        merchantReference: 'starbucks',
        categoryId: 'category-1',
        date: '2026-07-23',
        description: 'Meeting with client',
      },
    });

    expect(financialDrafts.prepare).toHaveBeenCalledWith(expect.objectContaining({
      walletDisplayLabel: 'BCA Debit',
      description: 'Meeting with client',
    }));
  });

  it('returns safe merchant ambiguity without drafting or exposing mapping IDs', async () => {
    const { service, entityResolution, financialDrafts } = setup();
    entityResolution.resolve.mockImplementation(async (input: any) => (
      input.reference.entityType === 'wallet'
        ? {
          kind: 'resolved',
          entityType: 'wallet',
          entity: { internalId: 'wallet-resolved' },
          displayLabel: 'BCA',
          confidence: { score: 1000, band: 'exact' },
          evidence: [{ kind: 'canonical_exact', scoreContribution: 1000 }],
        }
        : {
          kind: 'ambiguous',
          entityType: 'merchant',
          options: [
            {
              displayLabel: 'ＢＣＡ',
              confidence: { score: 1000, band: 'exact' },
              evidence: [{ kind: 'canonical_exact', scoreContribution: 1000 }],
              selection: { internalId: 'private-mapping-z' },
            },
            {
              displayLabel: 'BCA',
              confidence: { score: 1000, band: 'exact' },
              evidence: [{ kind: 'canonical_exact', scoreContribution: 1000 }],
              selection: { internalId: 'private-mapping-a' },
            },
          ],
        }
    ));

    const result = await service.execute('u1', 'corr-merchant-ambiguous', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE',
        amount: '45000',
        walletReference: 'BCA',
        merchantReference: 'bca',
        categoryId: 'category-1',
        date: '2026-07-23',
      },
    });

    expect(result.response).toMatchObject({
      status: 'clarification_required',
      data: {
        kind: 'ambiguous',
        entityType: 'merchant',
      },
    });
    // Internal mapping IDs are never exposed in the clarification response
    expect(JSON.stringify(result.response)).not.toContain('private-mapping');
    expect(JSON.stringify(result.response)).not.toContain('mapping-secret');
    expect(financialDrafts.prepare).not.toHaveBeenCalled();
  });

  it('continues a not_found merchant as bounded normalized free-form text', async () => {
    const { service, entityResolution, financialDrafts } = setup();
    entityResolution.resolve.mockImplementation(async (input: any) => (
      input.reference.entityType === 'wallet'
        ? {
          kind: 'resolved',
          entityType: 'wallet',
          entity: { internalId: 'wallet-resolved' },
          displayLabel: 'BCA',
          confidence: { score: 1000, band: 'exact' },
          evidence: [{ kind: 'canonical_exact', scoreContribution: 1000 }],
        }
        : {
          kind: 'not_found',
          entityType: 'merchant',
          normalizedReference: 'warung baru',
        }
    ));

    const result = await service.execute('u1', 'corr-merchant-freeform', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE',
        amount: '45000',
        walletReference: 'BCA',
        merchantReference: 'Warung—Baru',
        categoryId: 'category-1',
        date: '2026-07-23',
      },
    });

    expect(result.response.status).toBe('success');
    // not_found merchant continues to draft without merchant metadata
    expect(financialDrafts.prepare).toHaveBeenCalledWith(expect.objectContaining({
      walletDisplayLabel: 'BCA',
      categoryId: 'category-1',
    }));
  });

  it('rejects unsafe free-form merchant markup as inert data without drafting', async () => {
    const { service, entityResolution, financialDrafts } = setup();
    entityResolution.resolve.mockImplementation(async (input: any) => (
      input.reference.entityType === 'wallet'
        ? {
          kind: 'resolved',
          entityType: 'wallet',
          entity: { internalId: 'wallet-resolved' },
          displayLabel: 'BCA',
          confidence: { score: 1000, band: 'exact' },
          evidence: [{ kind: 'canonical_exact', scoreContribution: 1000 }],
        }
        : {
          kind: 'not_found',
          entityType: 'merchant',
          normalizedReference: '<script alert 1 >',
        }
    ));

    const result = await service.execute('u1', 'corr-merchant-markup', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE',
        amount: '45000',
        walletReference: 'BCA',
        merchantReference: '<script>alert(1)</script>',
        categoryId: 'category-1',
        date: '2026-07-23',
      },
    });

    expect(result.response).toMatchObject({
      status: 'error',
      code: 'ASSISTANT_INVALID_INPUT',
    });
    expect(financialDrafts.prepare).not.toHaveBeenCalled();
  });

  it('never forwards merchantReference or mapping identity on the internal wallet path', async () => {
    const { service, financialDrafts } = setup();

    await service.execute('u1', 'corr-internal-merchant', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE',
        amount: '45000',
        walletId: 'wallet-internal',
        merchantReference: 'Starbucks',
        categoryId: 'category-1',
        date: '2026-07-23',
      },
    });

    expect(financialDrafts.prepare).toHaveBeenCalledWith(expect.objectContaining({
      walletId: 'wallet-internal',
    }));
    const prepared = financialDrafts.prepare.mock.calls[0][0];
    expect(prepared).not.toHaveProperty('merchantReference');
    expect(prepared).not.toHaveProperty('merchantDisplayLabel');
    expect(JSON.stringify(prepared)).not.toContain('mapping-secret');
  });

  // ---- A.1 Wallet ambiguity: creates persisted ClarificationRequest ----

  it('creates a persisted clarification for ambiguous wallets with safe option tokens and no internal IDs', async () => {
    const { service, entityResolution, financialDrafts, clarification, conversations } = setup();
    entityResolution.resolve.mockResolvedValue({
      kind: 'ambiguous',
      entityType: 'wallet',
      options: [
        {
          displayLabel: 'BCA Debit',
          discriminator: 'BANK',
          confidence: { score: 950, band: 'strong' },
          evidence: [{ kind: 'alias_exact', scoreContribution: 950 }],
          selection: { internalId: 'secret-wallet-a' },
        },
        {
          displayLabel: 'BCA Payroll',
          discriminator: 'BANK',
          confidence: { score: 950, band: 'strong' },
          evidence: [{ kind: 'alias_exact', scoreContribution: 950 }],
          selection: { internalId: 'secret-wallet-b' },
        },
      ],
    });

    const result = await service.execute('u1', 'corr-amb', {
      intent: 'transaction.create',
      arguments: {
        type: 'EXPENSE', amount: '20000', walletReference: 'BCA',
        categoryId: 'category-1', date: '2026-07-23',
      },
    });

    // Persisted clarification created
    expect(result.response.status).toBe('clarification_required');
    expect(clarification.create).toHaveBeenCalledTimes(1);
    expect(clarification.create).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'wallet',
      userId: 'u1',
      trustedContext: expect.objectContaining({
        version: 1,
        operation: 'transaction.create',
        type: 'EXPENSE',
        amount: '20000',
        date: '2026-07-23',
      }),
      options: expect.arrayContaining([
        expect.objectContaining({ displayLabel: 'BCA Debit' }),
        expect.objectContaining({ displayLabel: 'BCA Payroll' }),
      ]),
    }));

    // No internal IDs leaked in public result
    expect(JSON.stringify(result.response)).not.toContain('secret-wallet');
    // No draft created
    expect(financialDrafts.prepare).not.toHaveBeenCalled();
    // Turn finalized with CLARIFICATION_REQUIRED
    expect(conversations.finalize).toHaveBeenCalledWith(expect.objectContaining({
      status: 'SUCCEEDED',
      turnStatus: 'CLARIFICATION_REQUIRED',
    }));
  });

  // ---- A.1 additional: no confidence/evidence/provider payload in public result ----

  it('does not expose confidence, evidence, or provider payload in the clarification response', async () => {
    const { service, entityResolution } = setup();
    entityResolution.resolve.mockResolvedValue({
      kind: 'ambiguous',
      entityType: 'wallet',
      options: [
        {
          displayLabel: 'BCA Debit', discriminator: 'BANK',
          confidence: { score: 950, band: 'strong' },
          evidence: [{ kind: 'alias_exact', scoreContribution: 950 }],
          selection: { internalId: 'secret-a' },
        },
      ],
    });

    const result = await service.execute('u1', 'corr-safe', {
      intent: 'transaction.create',
      arguments: { type: 'EXPENSE', amount: '20000', walletReference: 'BCA', categoryId: 'c1', date: '2026-07-23' },
    });

    const body = JSON.stringify(result.response);
    expect(body).not.toContain('confidence');
    expect(body).not.toContain('evidence');
    expect(body).not.toContain('payload');
    expect(body).not.toContain('secret-a');
    expect(body).not.toContain('internalId');
  });

  // ---- A.4: wallet not_found creates no ClarificationRequest ----

  it('returns not_found without creating a clarification request or draft', async () => {
    const { service, entityResolution, financialDrafts, clarification } = setup();
    entityResolution.resolve.mockResolvedValue({
      kind: 'not_found',
      entityType: 'wallet',
      normalizedReference: 'private wallet',
    });

    const result = await service.execute('u1', 'corr-nf', {
      intent: 'transaction.create',
      arguments: { type: 'EXPENSE', amount: '20000', walletReference: 'Private', categoryId: 'c1', date: '2026-07-23' },
    });

    expect(result.response.status).toBe('clarification_required');
    expect(result.response).toMatchObject({ data: { kind: 'not_found', entityType: 'wallet' } });
    expect(clarification.create).not.toHaveBeenCalled();
    expect(financialDrafts.prepare).not.toHaveBeenCalled();
  });

  // ---- A.5: no Transaction created, no wallet balance mutated ----

  it('walletId compatibility bypasses resolution and creates draft directly', async () => {
    const { service, entityResolution, financialDrafts } = setup();

    await service.execute('u1', 'corr-direct', {
      intent: 'transaction.create',
      arguments: { type: 'EXPENSE', amount: '20000', walletId: 'wallet-internal', categoryId: 'c1', date: '2026-07-23' },
    });

    expect(entityResolution.resolve).not.toHaveBeenCalled();
    expect(financialDrafts.prepare).toHaveBeenCalledWith(expect.objectContaining({
      walletId: 'wallet-internal',
    }));
  });

  // ---- A.5: invalid reference rejects without draft ----

  it('rejects an invalid wallet reference outcome without drafting', async () => {
    const { service, entityResolution, financialDrafts } = setup();
    entityResolution.resolve.mockResolvedValue({
      kind: 'invalid_reference',
      entityType: 'wallet',
      code: 'ENTITY_RESOLUTION_INVALID_REFERENCE',
    });

    const result = await service.execute('u1', 'corr-inv', {
      intent: 'transaction.create',
      arguments: { type: 'EXPENSE', amount: '20000', walletReference: ' ', categoryId: 'c1', date: '2026-07-23' },
    });

    expect(result.response).toMatchObject({ status: 'rejected', code: 'ASSISTANT_INVALID_INPUT' });
    expect(financialDrafts.prepare).not.toHaveBeenCalled();
  });

  // ---- Clarification selection flow ----

  it('selectClarification consumes the clarification and creates a draft', async () => {
    const { service, clarification, financialDrafts, conversations } = setup();

    const result = await service.selectClarification('u1', 'corr-sel', 'clarify_token_a', 'c1');

    expect(clarification.select).toHaveBeenCalledWith({
      userId: 'u1', conversationId: 'c1', token: 'clarify_token_a', correlationId: 'corr-sel',
    });
    expect(financialDrafts.prepare).toHaveBeenCalled();
    expect(result.response.status).toBe('success');
  });

  // ---- Cancel clarification flow ----

  it('cancelClarification transitions the clarification to CANCELLED', async () => {
    const { service, clarification } = setup();

    const result = await service.cancelClarification('u1', 'corr-can', 'clar-1', 'c1');

    expect(clarification.cancel).toHaveBeenCalledWith({
      userId: 'u1', clarificationId: 'clar-1', reason: 'user_cancelled',
    });
    expect(result.response.status).toBe('success');
  });

  // ---- getAssistantState ----

  it('getAssistantState delegates to the clarification service', async () => {
    const { service, clarification } = setup();
    clarification.getAssistantState.mockResolvedValue({
      activeClarification: { clarificationId: 'clar-1', entityType: 'wallet', prompt: 'Pilih wallet', options: [] },
    });

    const state = await service.getAssistantState('u1', 'c1');

    expect(clarification.getAssistantState).toHaveBeenCalledWith('u1', 'c1');
    expect(state).toHaveProperty('activeClarification');
  });

  // ---- Atomicity: failure during clarification creation rolls back ----

  it('does not create a clarification or draft when persistence fails mid-flight', async () => {
    const { service, entityResolution, clarification, financialDrafts } = setup();
    entityResolution.resolve.mockResolvedValue({
      kind: 'ambiguous',
      entityType: 'wallet',
      options: [{ displayLabel: 'BCA', confidence: { score: 950, band: 'strong' }, evidence: [], selection: { internalId: 'w1' } }],
    });
    clarification.create.mockRejectedValue(new Error('db failure'));

    await expect(service.execute('u1', 'corr-fail', {
      intent: 'transaction.create',
      arguments: { type: 'EXPENSE', amount: '20000', walletReference: 'BCA', categoryId: 'c1', date: '2026-07-23' },
    })).rejects.toThrow('db failure');

    expect(financialDrafts.prepare).not.toHaveBeenCalled();
  });
});

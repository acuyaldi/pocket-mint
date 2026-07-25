// ============================================================
// Clarification Engine — types
// ------------------------------------------------------------
// Provider-neutral. No LLM vendor types, no HTTP types.
// All clarification state is persisted; nothing ephemeral.
// ============================================================

import type { EntityType } from './entity-resolution';

export type ClarificationLifecycleStatus = 'PENDING' | 'CONSUMED' | 'CANCELLED' | 'STALE';

/**
 * Canonical trusted context v1.
 * Created ONLY from already-validated TransactionCreateToolInput.
 * Never copies provider fields, confidence, evidence, or metadata.
 */
export interface CanonicalContext {
  readonly version: 1;
  readonly operation: 'transaction.create';
  readonly type: 'INCOME' | 'EXPENSE';
  readonly amount: string;
  readonly date: string;
  readonly description?: string;
  readonly wallet?: {
    readonly internalId: string;
    readonly displayLabel: string;
  };
  readonly merchant?: {
    readonly internalId: string;
    readonly displayLabel: string;
  };
  readonly category?: {
    readonly internalId: string;
    readonly displayLabel: string;
    readonly categoryType: string;
  };
  readonly resumeAt: string;
  /** Optional reference fields preserved through the chain. */
  readonly merchantReference?: string;
  readonly categoryReference?: string;
}

export interface ClarificationOptionToken {
  /** One-time token presented by the user to select this option. */
  readonly token: string;
  /** Human-readable label. */
  readonly label: string;
  /** Optional type discriminator (e.g. "BANK", "E_WALLET"). */
  readonly discriminator?: string;
}

/** Safe projection of a single clarification option — no token, no internal ID. */
export interface SafeClarificationOption {
  readonly label: string;
  readonly discriminator?: string;
}

/** Creation response — carries newly issued one-time tokens. */
export interface ClarificationCreationProjection {
  readonly clarificationId: string;
  readonly entityType: EntityType;
  readonly prompt: string;
  readonly options: readonly ClarificationOptionToken[];
  readonly expiresAt?: string;
}

/** Safe public projection of a clarification request — no tokens. */
export interface ClarificationProjection {
  readonly clarificationId: string;
  readonly entityType: EntityType;
  readonly prompt: string;
  readonly options: readonly SafeClarificationOption[];
  readonly expiresAt?: string;
}

/** Safe terminal clarification summary. */
export interface TerminalClarification {
  readonly clarificationId: string;
  readonly entityType: EntityType;
  readonly status: ClarificationLifecycleStatus;
  readonly terminalCode?: string;
  readonly restartRequired: boolean;
}

/** Safe draft metadata for the conversation state projection. */
export interface SafeDraftMetadata {
  readonly draftId: string;
  readonly status: string;
  readonly preview: Record<string, unknown>;
}

/** Bounded assistantState projection exposed to the client. */
export interface AssistantStateProjection {
  readonly activeClarification?: ClarificationProjection;
  readonly pendingDraft?: SafeDraftMetadata;
  readonly latestTerminalClarification?: TerminalClarification;
}

export interface CreateClarificationInput {
  readonly userId: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly executionId: string;
  readonly entityType: EntityType;
  readonly parentClarificationId?: string;
  readonly trustedContext: CanonicalContext;
  readonly prompt: string;
  readonly options: readonly {
    readonly displayLabel: string;
    readonly discriminator?: string;
    readonly candidateId: string;
  }[];
}

export interface SelectClarificationInput {
  readonly userId: string;
  readonly conversationId: string;
  readonly token: string;
  readonly correlationId: string;
}

export interface SelectClarificationResult {
  readonly clarificationId: string;
  readonly entityType: EntityType;
  readonly status: 'CONSUMED';
  readonly selectedCandidateId: string;
  readonly selectedDisplayLabel: string;
  readonly trustedContext: CanonicalContext;
  readonly previousTrustedContext: CanonicalContext;
  readonly parentId?: string;
}

export interface CancelClarificationInput {
  readonly userId: string;
  readonly clarificationId: string;
  readonly reason: string;
}

/** Result after a successful selection that advances the sequential flow. */
export interface ClarificationAdvanceResult {
  readonly kind: 'next_clarification' | 'draft_ready';
  readonly consumedClarificationId: string;
  /** Present if another clarification is needed. */
  readonly nextClarification?: ClarificationProjection;
  /** Present when all clarifications are resolved. */
  readonly draftPreview?: SafeDraftMetadata;
}

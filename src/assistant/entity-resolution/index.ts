export { createEntityCandidate } from './candidate';
export type { CreateEntityCandidateInput } from './candidate';
export { EntityResolutionError } from './errors';
export type { EntityResolutionErrorCode } from './errors';
export {
  confidenceFromEvidence,
  matchEntityCandidate,
  normalizeEvidence,
} from './matching';
export {
  normalizeEntityReference,
} from './normalization';
export type {
  EntityReferenceNormalizationFailure,
  EntityReferenceNormalizationResult,
} from './normalization';
export { parseEntityReferenceInput } from './reference';
export { EntityResolverRegistry } from './registry';
export {
  createEntityResolutionService,
  toPublicEntityResolutionResult,
} from './service';
export {
  createWalletResolver,
  WALLET_TRANSACTION_CREATE_CONSTRAINTS,
} from './wallet-resolver';
export {
  createMerchantResolver,
  MERCHANT_TRANSACTION_CREATE_CONSTRAINTS,
} from './merchant-resolver';
export {
  createCategoryResolver,
  categoryConstraintsForType,
  CATEGORY_TRANSACTION_CREATE_CONSTRAINTS,
} from './category-resolver';
export * from './types';

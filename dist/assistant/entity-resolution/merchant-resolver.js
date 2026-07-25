"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MERCHANT_TRANSACTION_CREATE_CONSTRAINTS = void 0;
exports.createMerchantResolver = createMerchantResolver;
const candidate_1 = require("./candidate");
const errors_1 = require("./errors");
const matching_1 = require("./matching");
const normalization_1 = require("./normalization");
const types_1 = require("./types");
exports.MERCHANT_TRANSACTION_CREATE_CONSTRAINTS = Object.freeze({
    eligibleFor: 'transaction.create',
    ownerScoped: true,
});
function isTransactionCreateConstraints(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const keys = Object.keys(value).sort();
    return keys.length === 2
        && keys[0] === 'eligibleFor'
        && keys[1] === 'ownerScoped'
        && value.eligibleFor === 'transaction.create'
        && value.ownerScoped === true;
}
function aliasesFromMerchantName(name) {
    const normalized = (0, normalization_1.normalizeEntityReference)(name);
    if (!normalized.ok)
        return [];
    const words = normalized.normalized.split(/\s+/).filter(Boolean);
    const result = [...new Set([normalized.normalized, ...words])]
        .filter((a) => a.length >= 2 && Buffer.byteLength(a, 'utf8') <= types_1.ENTITY_RESOLUTION_LIMITS.aliasBytes)
        .sort()
        .slice(0, types_1.ENTITY_RESOLUTION_LIMITS.aliasesPerCandidate);
    return Object.freeze(result);
}
function createMerchantResolver(db) {
    const resolver = {
        entityType: 'merchant',
        async loadCandidates(scope) {
            const { authenticatedUserId, trustedConstraints } = scope;
            if (!isTransactionCreateConstraints(trustedConstraints)) {
                throw errors_1.EntityResolutionError.configuration();
            }
            const mappings = await db.merchantMapping.findMany({
                where: { userId: authenticatedUserId },
                select: { id: true, merchantName: true, normalizedMerchant: true },
                take: types_1.ENTITY_RESOLUTION_LIMITS.candidates + 1,
            });
            return mappings.map((mapping) => (0, candidate_1.createEntityCandidate)({
                entityType: 'merchant',
                internalId: mapping.id,
                displayLabel: mapping.merchantName,
                canonicalLabel: mapping.merchantName,
                aliases: aliasesFromMerchantName(mapping.merchantName),
                discriminator: undefined,
                trustedMetadata: {
                    normalizedMerchant: mapping.normalizedMerchant,
                    eligibleFor: trustedConstraints.eligibleFor,
                },
                stableTieBreakKey: mapping.id,
            }));
        },
        matchCandidate(input) {
            const { candidate, trustedConstraints } = input;
            if (!isTransactionCreateConstraints(trustedConstraints)
                || candidate.trustedMetadata.eligibleFor !== trustedConstraints.eligibleFor) {
                throw errors_1.EntityResolutionError.configuration();
            }
            return (0, matching_1.matchEntityCandidate)(candidate, input.reference, { constrained: false });
        },
    };
    return Object.freeze(resolver);
}
//# sourceMappingURL=merchant-resolver.js.map
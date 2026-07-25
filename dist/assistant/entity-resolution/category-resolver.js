"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORY_TRANSACTION_CREATE_CONSTRAINTS = void 0;
exports.categoryConstraintsForType = categoryConstraintsForType;
exports.createCategoryResolver = createCategoryResolver;
const candidate_1 = require("./candidate");
const errors_1 = require("./errors");
const matching_1 = require("./matching");
const normalization_1 = require("./normalization");
const types_1 = require("./types");
exports.CATEGORY_TRANSACTION_CREATE_CONSTRAINTS = Object.freeze({
    eligibleFor: 'transaction.create',
    ownerScoped: true,
    transactionType: 'EXPENSE',
});
function categoryConstraintsForType(transactionType) {
    return Object.freeze({
        eligibleFor: 'transaction.create',
        ownerScoped: true,
        transactionType,
    });
}
function isTransactionCreateConstraints(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const keys = Object.keys(value).sort();
    return keys.length === 3
        && keys[0] === 'eligibleFor'
        && keys[1] === 'ownerScoped'
        && keys[2] === 'transactionType'
        && value.eligibleFor === 'transaction.create'
        && value.ownerScoped === true
        && (value.transactionType === 'INCOME' || value.transactionType === 'EXPENSE');
}
function aliasesFromCategoryName(name) {
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
function createCategoryResolver(db) {
    const resolver = {
        entityType: 'category',
        async loadCandidates(scope) {
            const { authenticatedUserId, trustedConstraints } = scope;
            if (!isTransactionCreateConstraints(trustedConstraints)) {
                throw errors_1.EntityResolutionError.configuration();
            }
            const categories = await db.category.findMany({
                where: { userId: authenticatedUserId, type: trustedConstraints.transactionType },
                select: { id: true, name: true, type: true },
                take: types_1.ENTITY_RESOLUTION_LIMITS.candidates + 1,
            });
            return categories.map((category) => (0, candidate_1.createEntityCandidate)({
                entityType: 'category',
                internalId: category.id,
                displayLabel: category.name,
                canonicalLabel: category.name,
                aliases: aliasesFromCategoryName(category.name),
                discriminator: category.type,
                trustedMetadata: {
                    type: category.type,
                    eligibleFor: trustedConstraints.eligibleFor,
                },
                stableTieBreakKey: category.id,
            }));
        },
        matchCandidate(input) {
            const { candidate, trustedConstraints } = input;
            if (!isTransactionCreateConstraints(trustedConstraints)
                || candidate.trustedMetadata.eligibleFor !== trustedConstraints.eligibleFor) {
                throw errors_1.EntityResolutionError.configuration();
            }
            // Reject type-incompatible candidates
            if (candidate.trustedMetadata.type !== trustedConstraints.transactionType) {
                throw errors_1.EntityResolutionError.configuration();
            }
            return (0, matching_1.matchEntityCandidate)(candidate, input.reference, { constrained: false });
        },
    };
    return Object.freeze(resolver);
}
//# sourceMappingURL=category-resolver.js.map
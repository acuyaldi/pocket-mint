"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WALLET_TRANSACTION_CREATE_CONSTRAINTS = void 0;
exports.createWalletResolver = createWalletResolver;
const candidate_1 = require("./candidate");
const errors_1 = require("./errors");
const matching_1 = require("./matching");
const normalization_1 = require("./normalization");
const types_1 = require("./types");
exports.WALLET_TRANSACTION_CREATE_CONSTRAINTS = Object.freeze({
    eligibleFor: 'transaction.create',
    activeOnly: true,
});
function isTransactionCreateConstraints(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const keys = Object.keys(value).sort();
    return keys.length === 2
        && keys[0] === 'activeOnly'
        && keys[1] === 'eligibleFor'
        && value.activeOnly === true
        && value.eligibleFor === 'transaction.create';
}
function aliasesFromTrustedWalletName(name) {
    const normalized = (0, normalization_1.normalizeEntityReference)(name);
    if (!normalized.ok)
        throw errors_1.EntityResolutionError.configuration();
    const aliases = [...new Set(normalized.normalized.split(' '))]
        .filter((alias) => alias.length >= 2
        && alias !== normalized.normalized
        && Buffer.byteLength(alias, 'utf8') <= types_1.ENTITY_RESOLUTION_LIMITS.aliasBytes)
        .sort(compareText)
        .slice(0, types_1.ENTITY_RESOLUTION_LIMITS.aliasesPerCandidate);
    return Object.freeze(aliases);
}
function createWalletResolver(db) {
    const resolver = {
        entityType: 'wallet',
        async loadCandidates(scope) {
            const { authenticatedUserId, trustedConstraints } = scope;
            if (!isTransactionCreateConstraints(trustedConstraints)) {
                throw errors_1.EntityResolutionError.configuration();
            }
            const client = scope.transaction ?? db;
            const wallets = await client.wallet.findMany({
                where: { userId: authenticatedUserId, isArchived: false },
                select: {
                    id: true,
                    name: true,
                    type: true,
                    isArchived: true,
                },
                take: types_1.ENTITY_RESOLUTION_LIMITS.candidates + 1,
            });
            return wallets.map((wallet) => (0, candidate_1.createEntityCandidate)({
                entityType: 'wallet',
                internalId: wallet.id,
                displayLabel: wallet.name,
                canonicalLabel: wallet.name,
                aliases: aliasesFromTrustedWalletName(wallet.name),
                discriminator: wallet.type,
                trustedMetadata: {
                    type: wallet.type,
                    isArchived: wallet.isArchived,
                    eligibleFor: trustedConstraints.eligibleFor,
                },
                stableTieBreakKey: wallet.id,
            }));
        },
        matchCandidate(input) {
            const { candidate, reference, trustedConstraints } = input;
            if (!isTransactionCreateConstraints(trustedConstraints)
                || candidate.trustedMetadata.isArchived !== false
                || candidate.trustedMetadata.eligibleFor !== trustedConstraints.eligibleFor) {
                throw errors_1.EntityResolutionError.configuration();
            }
            return (0, matching_1.matchEntityCandidate)(candidate, reference, { constrained: true });
        },
    };
    return Object.freeze(resolver);
}
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
//# sourceMappingURL=wallet-resolver.js.map
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORY_TRANSACTION_CREATE_CONSTRAINTS = exports.categoryConstraintsForType = exports.createCategoryResolver = exports.MERCHANT_TRANSACTION_CREATE_CONSTRAINTS = exports.createMerchantResolver = exports.WALLET_TRANSACTION_CREATE_CONSTRAINTS = exports.createWalletResolver = exports.toPublicEntityResolutionResult = exports.createEntityResolutionService = exports.EntityResolverRegistry = exports.parseEntityReferenceInput = exports.normalizeEntityReference = exports.normalizeEvidence = exports.matchEntityCandidate = exports.confidenceFromEvidence = exports.EntityResolutionError = exports.createEntityCandidate = void 0;
var candidate_1 = require("./candidate");
Object.defineProperty(exports, "createEntityCandidate", { enumerable: true, get: function () { return candidate_1.createEntityCandidate; } });
var errors_1 = require("./errors");
Object.defineProperty(exports, "EntityResolutionError", { enumerable: true, get: function () { return errors_1.EntityResolutionError; } });
var matching_1 = require("./matching");
Object.defineProperty(exports, "confidenceFromEvidence", { enumerable: true, get: function () { return matching_1.confidenceFromEvidence; } });
Object.defineProperty(exports, "matchEntityCandidate", { enumerable: true, get: function () { return matching_1.matchEntityCandidate; } });
Object.defineProperty(exports, "normalizeEvidence", { enumerable: true, get: function () { return matching_1.normalizeEvidence; } });
var normalization_1 = require("./normalization");
Object.defineProperty(exports, "normalizeEntityReference", { enumerable: true, get: function () { return normalization_1.normalizeEntityReference; } });
var reference_1 = require("./reference");
Object.defineProperty(exports, "parseEntityReferenceInput", { enumerable: true, get: function () { return reference_1.parseEntityReferenceInput; } });
var registry_1 = require("./registry");
Object.defineProperty(exports, "EntityResolverRegistry", { enumerable: true, get: function () { return registry_1.EntityResolverRegistry; } });
var service_1 = require("./service");
Object.defineProperty(exports, "createEntityResolutionService", { enumerable: true, get: function () { return service_1.createEntityResolutionService; } });
Object.defineProperty(exports, "toPublicEntityResolutionResult", { enumerable: true, get: function () { return service_1.toPublicEntityResolutionResult; } });
var wallet_resolver_1 = require("./wallet-resolver");
Object.defineProperty(exports, "createWalletResolver", { enumerable: true, get: function () { return wallet_resolver_1.createWalletResolver; } });
Object.defineProperty(exports, "WALLET_TRANSACTION_CREATE_CONSTRAINTS", { enumerable: true, get: function () { return wallet_resolver_1.WALLET_TRANSACTION_CREATE_CONSTRAINTS; } });
var merchant_resolver_1 = require("./merchant-resolver");
Object.defineProperty(exports, "createMerchantResolver", { enumerable: true, get: function () { return merchant_resolver_1.createMerchantResolver; } });
Object.defineProperty(exports, "MERCHANT_TRANSACTION_CREATE_CONSTRAINTS", { enumerable: true, get: function () { return merchant_resolver_1.MERCHANT_TRANSACTION_CREATE_CONSTRAINTS; } });
var category_resolver_1 = require("./category-resolver");
Object.defineProperty(exports, "createCategoryResolver", { enumerable: true, get: function () { return category_resolver_1.createCategoryResolver; } });
Object.defineProperty(exports, "categoryConstraintsForType", { enumerable: true, get: function () { return category_resolver_1.categoryConstraintsForType; } });
Object.defineProperty(exports, "CATEGORY_TRANSACTION_CREATE_CONSTRAINTS", { enumerable: true, get: function () { return category_resolver_1.CATEGORY_TRANSACTION_CREATE_CONSTRAINTS; } });
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map
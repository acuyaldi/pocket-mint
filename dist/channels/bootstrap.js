"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.channelOutboundWorker = exports.channelInboundWorker = exports.channelConnectionService = exports.channelLinkTokenService = void 0;
const crypto_1 = require("crypto");
const prisma_1 = __importDefault(require("../lib/prisma"));
const config_1 = require("../config");
const linkToken_service_1 = require("./linkToken.service");
const connection_service_1 = require("./connection.service");
const client_1 = require("../telegram/client");
const bootstrap_1 = require("../assistant/bootstrap");
const inbound_worker_1 = require("./workers/inbound.worker");
const outbound_worker_1 = require("./workers/outbound.worker");
exports.channelLinkTokenService = (0, linkToken_service_1.createChannelLinkTokenService)(prisma_1.default);
exports.channelConnectionService = (0, connection_service_1.createChannelConnectionService)(prisma_1.default);
/** One process-unique lease-owner id, stable for the process lifetime (used as `leaseOwner`, not an authorization credential). */
const workerOwnerId = (0, crypto_1.randomUUID)();
exports.channelInboundWorker = config_1.telegramConfig.enabled
    ? (0, inbound_worker_1.createInboundWorker)({
        db: prisma_1.default,
        connections: exports.channelConnectionService,
        linkTokens: exports.channelLinkTokenService,
        assistantProviderRuntime: bootstrap_1.assistantProviderRuntime,
        config: config_1.channelWorkerConfig,
        owner: workerOwnerId,
    })
    : undefined;
exports.channelOutboundWorker = config_1.telegramConfig.enabled
    ? (0, outbound_worker_1.createOutboundWorker)({
        db: prisma_1.default,
        client: (0, client_1.createTelegramClient)({ botToken: config_1.telegramConfig.botToken }),
        config: config_1.channelWorkerConfig,
        owner: workerOwnerId,
    })
    : undefined;
//# sourceMappingURL=bootstrap.js.map
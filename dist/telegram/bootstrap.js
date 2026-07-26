"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramService = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const config_1 = require("../config");
const bootstrap_1 = require("../channels/bootstrap");
const bootstrap_2 = require("../assistant/bootstrap");
const client_1 = require("./client");
const telegram_service_1 = require("./telegram.service");
exports.telegramService = config_1.telegramConfig.enabled
    ? (0, telegram_service_1.createTelegramService)({
        db: prisma_1.default,
        linkTokens: bootstrap_1.channelLinkTokenService,
        connections: bootstrap_1.channelConnectionService,
        client: (0, client_1.createTelegramClient)({ botToken: config_1.telegramConfig.botToken }),
        assistantProviderRuntime: bootstrap_2.assistantProviderRuntime,
    })
    : undefined;
//# sourceMappingURL=bootstrap.js.map
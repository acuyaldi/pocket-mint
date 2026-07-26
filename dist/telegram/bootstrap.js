"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramService = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const config_1 = require("../config");
const bootstrap_1 = require("../channels/bootstrap");
const telegram_service_1 = require("./telegram.service");
/** Webhook-facing service only — persists inbound jobs, never invokes the Assistant or Telegram delivery (see the channel workers in src/channels/workers/). */
exports.telegramService = config_1.telegramConfig.enabled
    ? (0, telegram_service_1.createTelegramService)({
        db: prisma_1.default,
        connections: bootstrap_1.channelConnectionService,
    })
    : undefined;
//# sourceMappingURL=bootstrap.js.map
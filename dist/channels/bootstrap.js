"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.channelConnectionService = exports.channelLinkTokenService = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const linkToken_service_1 = require("./linkToken.service");
const connection_service_1 = require("./connection.service");
exports.channelLinkTokenService = (0, linkToken_service_1.createChannelLinkTokenService)(prisma_1.default);
exports.channelConnectionService = (0, connection_service_1.createChannelConnectionService)(prisma_1.default);
//# sourceMappingURL=bootstrap.js.map
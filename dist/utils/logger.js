"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const env_js_1 = require("../config/env.js");
/**
 * Structured logger. Pretty transport is intentionally omitted to keep the
 * dependency surface small and avoid a hard dev-only dependency; JSON logs
 * are fine for both dev and prod and are easy to pipe through `pino-pretty`.
 */
exports.logger = (0, pino_1.default)({
    level: env_js_1.env.LOG_LEVEL,
    base: undefined,
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
    redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.privateKey'],
        censor: '[redacted]',
    },
    ...(env_js_1.isProduction ? {} : {}),
});
//# sourceMappingURL=logger.js.map
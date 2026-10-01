"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiLimiter = exports.globalLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_js_1 = require("../config/env.js");
const tooMany = {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please slow down.' },
};
/**
 * Keys rate limiting by authenticated UID when available, otherwise by IP.
 * This prevents one heavy user from exhausting a shared-IP quota and vice-versa.
 */
function keyByUidOrIp(req) {
    return req.uid ?? req.ip ?? 'unknown';
}
/** Global limiter applied to all /api traffic. */
exports.globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: env_js_1.env.RATE_LIMIT_WINDOW_MS,
    max: env_js_1.env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyByUidOrIp,
    message: tooMany,
});
/** Stricter limiter for AI endpoints (Gemini calls are expensive). */
exports.aiLimiter = (0, express_rate_limit_1.default)({
    windowMs: env_js_1.env.AI_RATE_LIMIT_WINDOW_MS,
    max: env_js_1.env.AI_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyByUidOrIp,
    message: {
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'AI request limit reached. Please wait a moment and try again.' },
    },
});
//# sourceMappingURL=rateLimit.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = notFoundHandler;
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const errors_js_1 = require("../utils/errors.js");
const env_js_1 = require("../config/env.js");
const logger_js_1 = require("../utils/logger.js");
/** 404 handler for unmatched routes. */
function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.originalUrl}` },
    });
}
/**
 * Centralized error handler. Normalizes AppError, ZodError and unknown errors
 * into a consistent JSON envelope. Never leaks stack traces in production.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function errorHandler(err, _req, res, _next) {
    if (err instanceof zod_1.ZodError) {
        res.status(422).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Request validation failed',
                details: err.flatten(),
            },
        });
        return;
    }
    if (err instanceof errors_js_1.AppError) {
        if (!err.isOperational || err.statusCode >= 500) {
            logger_js_1.logger.error({ err, code: err.code }, err.message);
        }
        res.status(err.statusCode).json({
            success: false,
            error: { code: err.code, message: err.message, details: err.details },
        });
        return;
    }
    logger_js_1.logger.error({ err }, 'Unhandled error');
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
            ...(env_js_1.isProduction ? {} : { details: err instanceof Error ? err.message : String(err) }),
        },
    });
}
//# sourceMappingURL=errorHandler.js.map
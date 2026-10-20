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
function errorHandler(err, req, res, _next) {
    if (err instanceof zod_1.ZodError) {
        // TEMP-422-DIAG: safe, temporary server-side logging of validation failures.
        // The PM2 access log shows the 422 status but not the failing field, and the
        // response body isn't captured there. This logs ONLY the Zod issue shape
        // (field path + code + message + expected/received TYPE names) plus the route
        // — never the request body, headers, Authorization/Firebase tokens, or any
        // field VALUE. `received`/`expected` are Zod type names (e.g. "float"), not
        // user data. Behavior, status (422), and the response contract are unchanged.
        // Remove this block once the production failing field has been identified.
        logger_js_1.logger.warn({
            tag: 'TEMP-422-DIAG',
            method: req.method,
            path: req.originalUrl,
            issues: err.issues.map((issue) => {
                const safe = {
                    path: issue.path.join('.'),
                    code: issue.code,
                    message: issue.message,
                };
                // `expected`/`received` exist only on invalid_type issues and are
                // type NAMES (not values), so they are safe to log.
                const typed = issue;
                if (typeof typed.expected === 'string')
                    safe.expected = typed.expected;
                if (typeof typed.received === 'string')
                    safe.received = typed.received;
                return safe;
            }),
        }, 'Request validation failed (422)');
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
    logger_js_1.logger.error({
        err,
        method: req.method,
        path: req.originalUrl,
        code: err.code,
    }, 'Unhandled error');
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
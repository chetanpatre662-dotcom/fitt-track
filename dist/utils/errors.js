"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationError = exports.ServiceUnavailableError = exports.TooManyRequestsError = exports.ConflictError = exports.NotFoundError = exports.ForbiddenError = exports.UnauthorizedError = exports.ValidationError = exports.BadRequestError = exports.AppError = void 0;
/**
 * Application error hierarchy. Controllers/services throw these; the
 * centralized error handler converts them into consistent JSON responses.
 */
class AppError extends Error {
    statusCode;
    code;
    details;
    isOperational;
    constructor(statusCode, code, message, details, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = isOperational;
        Error.captureStackTrace?.(this, this.constructor);
    }
}
exports.AppError = AppError;
class BadRequestError extends AppError {
    constructor(message = 'Bad request', details) {
        super(400, 'BAD_REQUEST', message, details);
    }
}
exports.BadRequestError = BadRequestError;
class ValidationError extends AppError {
    constructor(message = 'Validation failed', details) {
        super(422, 'VALIDATION_ERROR', message, details);
    }
}
exports.ValidationError = ValidationError;
class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required') {
        super(401, 'UNAUTHORIZED', message);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError {
    constructor(message = 'You do not have access to this resource') {
        super(403, 'FORBIDDEN', message);
    }
}
exports.ForbiddenError = ForbiddenError;
class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(404, 'NOT_FOUND', message);
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
    constructor(message = 'Resource conflict', details) {
        super(409, 'CONFLICT', message, details);
    }
}
exports.ConflictError = ConflictError;
class TooManyRequestsError extends AppError {
    constructor(message = 'Too many requests') {
        super(429, 'TOO_MANY_REQUESTS', message);
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
class ServiceUnavailableError extends AppError {
    constructor(message = 'Service temporarily unavailable', details) {
        super(503, 'SERVICE_UNAVAILABLE', message, details);
    }
}
exports.ServiceUnavailableError = ServiceUnavailableError;
/** Raised when a feature is invoked but its required credentials are missing. */
class ConfigurationError extends AppError {
    constructor(message = 'Server is not configured for this feature', details) {
        super(503, 'NOT_CONFIGURED', message, details);
    }
}
exports.ConfigurationError = ConfigurationError;
//# sourceMappingURL=errors.js.map
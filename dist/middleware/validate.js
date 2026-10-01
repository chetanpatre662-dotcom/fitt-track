"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commonSchemas = void 0;
exports.validate = validate;
const zod_1 = require("zod");
/**
 * Builds a middleware that validates and coerces the request's body, query,
 * and/or params against Zod schemas. On success the parsed values replace the
 * originals so controllers receive typed, sanitized input. On failure a
 * ZodError propagates to the centralized error handler (→ 422).
 */
function validate(schemas) {
    return (req, _res, next) => {
        try {
            if (schemas.body)
                req.body = schemas.body.parse(req.body);
            if (schemas.query) {
                // req.query is read-only in Express 5-style typings; assign parsed copy.
                const parsedQuery = schemas.query.parse(req.query);
                Object.defineProperty(req, 'query', { value: parsedQuery, configurable: true });
            }
            if (schemas.params)
                req.params = schemas.params.parse(req.params);
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
/** Common reusable field schemas shared across validators. */
exports.commonSchemas = {
    /** yyyy-MM-dd date key. */
    dateKey: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Expected date in yyyy-MM-dd format'),
    /** Firestore-safe document id. */
    id: zod_1.z.string().min(1).max(1500),
    /** HH:mm 24-hour time. */
    timeOfDay: zod_1.z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, 'Expected time in HH:mm 24-hour format'),
};
//# sourceMappingURL=validate.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exerciseIdParamsSchema = exports.exerciseSearchQuerySchema = exports.exerciseListQuerySchema = void 0;
const zod_1 = require("zod");
const domain_js_1 = require("../models/domain.js");
/**
 * Query schema for GET /api/exercises. All filters are optional and combine
 * with AND. Values are coerced from query strings.
 */
exports.exerciseListQuerySchema = zod_1.z.object({
    location: zod_1.z.enum(['all', ...domain_js_1.WORKOUT_LOCATIONS]).optional(),
    muscle: zod_1.z.enum(['all', ...domain_js_1.MUSCLE_GROUPS]).optional(),
    equipment: zod_1.z.enum(domain_js_1.EQUIPMENT).optional(),
    difficulty: zod_1.z.enum(['all', ...domain_js_1.DIFFICULTIES]).optional(),
    type: zod_1.z.enum(['all', ...domain_js_1.EXERCISE_TYPES]).optional(),
    q: zod_1.z.string().trim().max(100).optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(500).optional(),
    offset: zod_1.z.coerce.number().int().min(0).optional(),
});
exports.exerciseSearchQuerySchema = zod_1.z.object({
    q: zod_1.z.string().trim().min(1).max(100),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
exports.exerciseIdParamsSchema = zod_1.z.object({
    id: zod_1.z.string().min(1).max(200),
});
//# sourceMappingURL=exerciseValidators.js.map
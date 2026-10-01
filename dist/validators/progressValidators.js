"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exerciseProgressionQuerySchema = exports.rangeQuerySchema = void 0;
const zod_1 = require("zod");
exports.rangeQuerySchema = zod_1.z.object({
    range: zod_1.z.enum(['7d', '30d', '90d', '1y', 'all']).default('30d'),
    limit: zod_1.z.coerce.number().int().min(1).max(365).optional(),
});
exports.exerciseProgressionQuerySchema = zod_1.z.object({
    exerciseId: zod_1.z.string().min(1).max(200),
    range: zod_1.z.enum(['7d', '30d', '90d', '1y', 'all']).default('90d'),
});
//# sourceMappingURL=progressValidators.js.map
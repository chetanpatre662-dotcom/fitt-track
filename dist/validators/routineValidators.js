"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routineIdParamsSchema = exports.routineCompletionsQuerySchema = exports.routineCompleteSchema = exports.routineUpsertSchema = void 0;
const zod_1 = require("zod");
const domain_js_1 = require("../models/domain.js");
const validate_js_1 = require("../middleware/validate.js");
/** Create/update payload for a routine item. repeatDays: 0=Sun..6=Sat. */
exports.routineUpsertSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(120),
    description: zod_1.z.string().max(500).nullable().optional(),
    category: zod_1.z.enum(domain_js_1.ROUTINE_CATEGORIES),
    time: validate_js_1.commonSchemas.timeOfDay,
    repeatDays: zod_1.z.array(zod_1.z.number().int().min(0).max(6)).max(7).default([0, 1, 2, 3, 4, 5, 6]),
    enabled: zod_1.z.boolean().default(true),
    notificationEnabled: zod_1.z.boolean().default(true),
});
exports.routineCompleteSchema = zod_1.z.object({
    dateKey: validate_js_1.commonSchemas.dateKey,
    status: zod_1.z.enum(['pending', 'completed', 'skipped']).default('completed'),
});
exports.routineCompletionsQuerySchema = zod_1.z.object({
    date: validate_js_1.commonSchemas.dateKey.optional(),
});
exports.routineIdParamsSchema = zod_1.z.object({ id: zod_1.z.string().min(1).max(200) });
//# sourceMappingURL=routineValidators.js.map
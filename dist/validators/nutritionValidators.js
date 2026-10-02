"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.foodLogIdParamsSchema = exports.customFoodUpsertSchema = exports.foodSearchQuerySchema = exports.nutritionDayQuerySchema = exports.foodLogUpsertSchema = void 0;
const zod_1 = require("zod");
const domain_js_1 = require("../models/domain.js");
const validate_js_1 = require("../middleware/validate.js");
/** A logged food entry. Macros are the totals for the logged quantity. */
exports.foodLogUpsertSchema = zod_1.z.object({
    dateKey: validate_js_1.commonSchemas.dateKey,
    mealType: zod_1.z.enum(domain_js_1.MEAL_TYPES),
    // Stable id + label for a user-defined meal (used with mealType 'custom').
    // mealId is the durable association (survives meal renames); mealName is the
    // label at log time. Both optional/nullable so existing historical logs
    // (which lack them) remain valid and unaffected.
    mealId: zod_1.z.string().min(1).max(80).nullable().optional(),
    mealName: zod_1.z.string().min(1).max(60).nullable().optional(),
    name: zod_1.z.string().min(1).max(120),
    foodId: zod_1.z.string().max(200).nullable().optional(),
    servingSize: zod_1.z.string().max(80).default('1 serving'),
    quantity: zod_1.z.number().min(0.01).max(100).default(1),
    calories: zod_1.z.number().min(0).max(20_000),
    protein: zod_1.z.number().min(0).max(2000).default(0),
    carbs: zod_1.z.number().min(0).max(2000).default(0),
    fat: zod_1.z.number().min(0).max(2000).default(0),
    fiber: zod_1.z.number().min(0).max(500).default(0),
    sugar: zod_1.z.number().min(0).max(2000).default(0),
    sodium: zod_1.z.number().min(0).max(100_000).default(0),
});
exports.nutritionDayQuerySchema = zod_1.z.object({
    date: validate_js_1.commonSchemas.dateKey.optional(),
});
exports.foodSearchQuerySchema = zod_1.z.object({
    q: zod_1.z.string().trim().min(1).max(80),
    limit: zod_1.z.coerce.number().int().min(1).max(50).optional(),
});
/** A saved custom food or favorite (reusable definition, per-serving macros). */
exports.customFoodUpsertSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(120),
    servingSize: zod_1.z.string().max(80).default('1 serving'),
    calories: zod_1.z.number().min(0).max(20_000),
    protein: zod_1.z.number().min(0).max(2000).default(0),
    carbs: zod_1.z.number().min(0).max(2000).default(0),
    fat: zod_1.z.number().min(0).max(2000).default(0),
    fiber: zod_1.z.number().min(0).max(500).default(0),
    sugar: zod_1.z.number().min(0).max(2000).default(0),
    sodium: zod_1.z.number().min(0).max(100_000).default(0),
    isFavorite: zod_1.z.boolean().default(false),
});
exports.foodLogIdParamsSchema = zod_1.z.object({ id: zod_1.z.string().min(1).max(200) });
//# sourceMappingURL=nutritionValidators.js.map
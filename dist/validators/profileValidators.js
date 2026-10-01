"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileUpsertSchema = void 0;
const zod_1 = require("zod");
const domain_js_1 = require("../models/domain.js");
const validate_js_1 = require("../middleware/validate.js");
const fitnessLevel = zod_1.z.enum(domain_js_1.DIFFICULTIES);
/** A single user-defined meal: a name/type and a HH:mm time. */
const mealEntrySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(60),
    time: validate_js_1.commonSchemas.timeOfDay,
});
const lifestyleSchema = zod_1.z.object({
    wakeTime: validate_js_1.commonSchemas.timeOfDay,
    sleepTime: validate_js_1.commonSchemas.timeOfDay,
    breakfastTime: validate_js_1.commonSchemas.timeOfDay,
    lunchTime: validate_js_1.commonSchemas.timeOfDay,
    dinnerTime: validate_js_1.commonSchemas.timeOfDay,
    snackTimes: zod_1.z.array(validate_js_1.commonSchemas.timeOfDay).max(6).default([]),
    waterReminderMinutes: zod_1.z.number().int().min(15).max(480).default(90),
    // Flexible, user-controlled meal schedule. Optional for backward
    // compatibility with clients/profiles that only send the fixed fields.
    meals: zod_1.z.array(mealEntrySchema).max(20).optional(),
});
const targetsSchema = zod_1.z.object({
    calories: zod_1.z.number().int().min(1000).max(8000),
    protein: zod_1.z.number().int().min(0).max(500),
    carbs: zod_1.z.number().int().min(0).max(1200),
    fat: zod_1.z.number().int().min(0).max(400),
    waterMl: zod_1.z.number().int().min(500).max(10000),
    isCustom: zod_1.z.boolean().default(true),
});
/**
 * Profile upsert schema. `dateOfBirth` is an ISO date string.
 * `targets` is optional — when omitted (or isCustom=false) the backend
 * recomputes estimates from the profile fields.
 */
exports.profileUpsertSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(80),
    photoUrl: zod_1.z.string().url().max(2000).optional().nullable(),
    dateOfBirth: zod_1.z.string().datetime({ offset: true }).or(zod_1.z.string().date()),
    gender: zod_1.z.enum(domain_js_1.GENDERS),
    heightCm: zod_1.z.number().min(80).max(260),
    weightKg: zod_1.z.number().min(25).max(400),
    fitnessLevel,
    goals: zod_1.z.array(zod_1.z.enum(domain_js_1.GOALS)).min(1).max(4),
    activityLevel: zod_1.z.enum(domain_js_1.ACTIVITY_LEVELS),
    workoutDaysPerWeek: zod_1.z.number().int().min(0).max(7),
    preferredWorkoutTime: validate_js_1.commonSchemas.timeOfDay,
    workoutLocation: zod_1.z.enum(domain_js_1.WORKOUT_LOCATIONS),
    equipment: zod_1.z.array(zod_1.z.enum(domain_js_1.EQUIPMENT)).default([]),
    lifestyle: lifestyleSchema,
    targets: targetsSchema.optional(),
    units: zod_1.z.enum(['metric', 'imperial']).default('metric'),
});
//# sourceMappingURL=profileValidators.js.map
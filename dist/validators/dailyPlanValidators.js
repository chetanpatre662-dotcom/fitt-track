"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyPlanUpdateSchema = exports.dailyPlanGenerateSchema = exports.dailyPlanQuerySchema = void 0;
const zod_1 = require("zod");
const domain_js_1 = require("../models/domain.js");
/** yyyy-MM-dd date key (optional; defaults to today server-side). */
const dateKeyField = zod_1.z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Expected date in yyyy-MM-dd format')
    .optional();
/** Query for GET /api/ai/daily-plan. */
exports.dailyPlanQuerySchema = zod_1.z.object({ date: dateKeyField });
/** Body for POST /api/ai/daily-plan/generate (create-once-and-persist). */
exports.dailyPlanGenerateSchema = zod_1.z.object({
    date: dateKeyField,
    location: zod_1.z.enum(domain_js_1.WORKOUT_LOCATIONS).optional(),
    muscle: zod_1.z.enum(domain_js_1.MUSCLE_GROUPS).optional(),
    durationMinutes: zod_1.z.number().int().min(10).max(180).optional(),
    /** When true, regenerate even if a plan already exists for the date. */
    force: zod_1.z.boolean().optional(),
});
const planExerciseSchema = zod_1.z.object({
    exerciseId: zod_1.z.string().min(1).max(200),
    sets: zod_1.z.number().int().min(1).max(12),
    repMin: zod_1.z.number().int().min(1).max(100),
    repMax: zod_1.z.number().int().min(1).max(100),
    restSeconds: zod_1.z.number().int().min(0).max(600),
    reason: zod_1.z.string().max(300).optional().default(''),
});
/**
 * Body for PUT /api/ai/daily-plan. Two mutually-useful modes:
 *  - Provide `exercises` to save an explicit structured plan (user-edited).
 *  - Provide `muscleGroups` (and optional focus) with no `exercises` to have
 *    the backend regenerate exercises for those muscles and persist them.
 * Either way the result becomes the single persisted plan for the date.
 */
exports.dailyPlanUpdateSchema = zod_1.z.object({
    date: dateKeyField,
    title: zod_1.z.string().min(1).max(120).optional(),
    goal: zod_1.z.string().max(120).optional(),
    durationMinutes: zod_1.z.number().int().min(5).max(240).optional(),
    muscleGroups: zod_1.z.array(zod_1.z.enum(domain_js_1.MUSCLE_GROUPS)).max(6).optional(),
    location: zod_1.z.enum(domain_js_1.WORKOUT_LOCATIONS).optional(),
    exercises: zod_1.z.array(planExerciseSchema).min(1).max(15).optional(),
    notes: zod_1.z.string().max(1000).optional(),
});
//# sourceMappingURL=dailyPlanValidators.js.map
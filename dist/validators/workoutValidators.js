"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workoutIdParamsSchema = exports.workoutListQuerySchema = exports.workoutStatusSchema = exports.workoutUpsertSchema = void 0;
const zod_1 = require("zod");
const domain_js_1 = require("../models/domain.js");
const setSchema = zod_1.z.object({
    setNumber: zod_1.z.number().int().min(1),
    weightKg: zod_1.z.number().min(0).max(1000).nullable().optional(),
    reps: zod_1.z.number().int().min(0).max(1000).nullable().optional(),
    distanceM: zod_1.z.number().min(0).max(1_000_000).nullable().optional(),
    durationSeconds: zod_1.z.number().int().min(0).max(86_400).nullable().optional(),
    calories: zod_1.z.number().min(0).max(20_000).nullable().optional(),
    completed: zod_1.z.boolean().default(false),
});
const workoutExerciseSchema = zod_1.z.object({
    exerciseId: zod_1.z.string().min(1).max(200),
    order: zod_1.z.number().int().min(0),
    notes: zod_1.z.string().max(1000).nullable().optional(),
    primaryMuscle: zod_1.z.enum(domain_js_1.MUSCLE_GROUPS).optional(),
    // Unlimited sets — no fixed count.
    sets: zod_1.z.array(setSchema).max(50).default([]),
});
/** Create/update payload for a workout (also used for templates). */
exports.workoutUpsertSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(120),
    type: zod_1.z.enum(domain_js_1.EXERCISE_TYPES).default('strength'),
    isTemplate: zod_1.z.boolean().default(false),
    notes: zod_1.z.string().max(2000).nullable().optional(),
    exercises: zod_1.z.array(workoutExerciseSchema).max(60).default([]),
});
/** Status transition payload. */
exports.workoutStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(domain_js_1.WORKOUT_STATUSES),
});
exports.workoutListQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(domain_js_1.WORKOUT_STATUSES).optional(),
    isTemplate: zod_1.z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional(),
});
exports.workoutIdParamsSchema = zod_1.z.object({ id: zod_1.z.string().min(1).max(200) });
//# sourceMappingURL=workoutValidators.js.map
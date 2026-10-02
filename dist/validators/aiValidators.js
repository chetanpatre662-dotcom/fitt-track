"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationIdParamsSchema = exports.substitutionRequestSchema = exports.generateWorkoutSchema = exports.workoutRecoSchema = exports.chatSchema = void 0;
const zod_1 = require("zod");
const domain_js_1 = require("../models/domain.js");
exports.chatSchema = zod_1.z.object({
    message: zod_1.z.string().min(1).max(2000),
    conversationId: zod_1.z.string().max(200).optional(),
});
exports.workoutRecoSchema = zod_1.z.object({
    location: zod_1.z.enum(domain_js_1.WORKOUT_LOCATIONS).optional(),
    muscle: zod_1.z.enum(domain_js_1.MUSCLE_GROUPS).optional(),
    durationMinutes: zod_1.z.number().int().min(10).max(180).optional(),
});
exports.generateWorkoutSchema = zod_1.z.object({
    location: zod_1.z.enum(domain_js_1.WORKOUT_LOCATIONS),
    muscle: zod_1.z.enum(domain_js_1.MUSCLE_GROUPS).optional(),
    durationMinutes: zod_1.z.number().int().min(10).max(180).optional(),
});
exports.substitutionRequestSchema = zod_1.z.object({
    exerciseId: zod_1.z.string().min(1).max(200),
});
/** Path param for fetching a single conversation's messages. */
exports.conversationIdParamsSchema = zod_1.z.object({
    id: zod_1.z.string().min(1).max(200),
});
//# sourceMappingURL=aiValidators.js.map
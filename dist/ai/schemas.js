"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiSchemas = exports.planModificationSchema = exports.progressAnalysisSchema = exports.recoverySchema = exports.substitutionSchema = exports.dailyInsightSchema = exports.nutritionRecommendationSchema = exports.workoutRecommendationSchema = void 0;
const zod_1 = require("zod");
/** Zod schemas validating Gemini JSON responses before returning to Flutter. */
exports.workoutRecommendationSchema = zod_1.z.object({
    title: zod_1.z.string(),
    goal: zod_1.z.string(),
    durationMinutes: zod_1.z.number().int().min(5).max(240),
    exercises: zod_1.z
        .array(zod_1.z.object({
        exerciseId: zod_1.z.string(),
        sets: zod_1.z.number().int().min(1).max(12),
        repMin: zod_1.z.number().int().min(1).max(100),
        repMax: zod_1.z.number().int().min(1).max(100),
        restSeconds: zod_1.z.number().int().min(0).max(600),
        reason: zod_1.z.string().optional().default(''),
    }))
        .min(1)
        .max(15),
    notes: zod_1.z.string().optional().default(''),
});
exports.nutritionRecommendationSchema = zod_1.z.object({
    summary: zod_1.z.string(),
    suggestions: zod_1.z
        .array(zod_1.z.object({
        food: zod_1.z.string(),
        reason: zod_1.z.string(),
        estimatedProtein: zod_1.z.number().min(0).max(500).default(0),
        estimatedCalories: zod_1.z.number().min(0).max(5000).default(0),
    }))
        .max(10)
        .default([]),
});
exports.dailyInsightSchema = zod_1.z.object({
    insight: zod_1.z.string(),
    focus: zod_1.z.string().optional().default(''),
});
exports.substitutionSchema = zod_1.z.object({
    alternatives: zod_1.z
        .array(zod_1.z.object({
        exerciseId: zod_1.z.string(),
        reason: zod_1.z.string().optional().default(''),
    }))
        .max(6)
        .default([]),
});
exports.recoverySchema = zod_1.z.object({
    summary: zod_1.z.string(),
    recommendedFocusMuscles: zod_1.z.array(zod_1.z.string()).max(6).default([]),
    musclesToRest: zod_1.z.array(zod_1.z.string()).max(6).default([]),
});
exports.progressAnalysisSchema = zod_1.z.object({
    summary: zod_1.z.string(),
    highlights: zod_1.z.array(zod_1.z.string()).max(6).default([]),
    suggestions: zod_1.z.array(zod_1.z.string()).max(6).default([]),
});
/**
 * Structured detection of whether a chat message is asking to CHANGE today's
 * workout plan, and if so which muscle groups the user wants. Muscle values are
 * strictly re-validated against MUSCLE_GROUPS in the service before use.
 */
exports.planModificationSchema = zod_1.z.object({
    isModification: zod_1.z.boolean(),
    muscleGroups: zod_1.z.array(zod_1.z.string()).max(6).default([]),
});
/** Gemini responseSchema equivalents (Type-based) for structured output. */
exports.geminiSchemas = {
    workoutRecommendation: {
        type: 'object',
        properties: {
            title: { type: 'string' },
            goal: { type: 'string' },
            durationMinutes: { type: 'integer' },
            exercises: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        exerciseId: { type: 'string' },
                        sets: { type: 'integer' },
                        repMin: { type: 'integer' },
                        repMax: { type: 'integer' },
                        restSeconds: { type: 'integer' },
                        reason: { type: 'string' },
                    },
                    required: ['exerciseId', 'sets', 'repMin', 'repMax', 'restSeconds'],
                },
            },
            notes: { type: 'string' },
        },
        required: ['title', 'goal', 'durationMinutes', 'exercises'],
    },
    nutritionRecommendation: {
        type: 'object',
        properties: {
            summary: { type: 'string' },
            suggestions: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        food: { type: 'string' },
                        reason: { type: 'string' },
                        estimatedProtein: { type: 'number' },
                        estimatedCalories: { type: 'number' },
                    },
                    required: ['food', 'reason'],
                },
            },
        },
        required: ['summary', 'suggestions'],
    },
    dailyInsight: {
        type: 'object',
        properties: { insight: { type: 'string' }, focus: { type: 'string' } },
        required: ['insight'],
    },
    substitution: {
        type: 'object',
        properties: {
            alternatives: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: { exerciseId: { type: 'string' }, reason: { type: 'string' } },
                    required: ['exerciseId'],
                },
            },
        },
        required: ['alternatives'],
    },
    recovery: {
        type: 'object',
        properties: {
            summary: { type: 'string' },
            recommendedFocusMuscles: { type: 'array', items: { type: 'string' } },
            musclesToRest: { type: 'array', items: { type: 'string' } },
        },
        required: ['summary'],
    },
    progressAnalysis: {
        type: 'object',
        properties: {
            summary: { type: 'string' },
            highlights: { type: 'array', items: { type: 'string' } },
            suggestions: { type: 'array', items: { type: 'string' } },
        },
        required: ['summary'],
    },
    planModification: {
        type: 'object',
        properties: {
            isModification: { type: 'boolean' },
            muscleGroups: { type: 'array', items: { type: 'string' } },
        },
        required: ['isModification'],
    },
};
//# sourceMappingURL=schemas.js.map
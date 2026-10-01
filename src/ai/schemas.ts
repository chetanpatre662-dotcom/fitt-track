import { z } from 'zod';

/** Zod schemas validating Gemini JSON responses before returning to Flutter. */

export const workoutRecommendationSchema = z.object({
  title: z.string(),
  goal: z.string(),
  durationMinutes: z.number().int().min(5).max(240),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string(),
        sets: z.number().int().min(1).max(12),
        repMin: z.number().int().min(1).max(100),
        repMax: z.number().int().min(1).max(100),
        restSeconds: z.number().int().min(0).max(600),
        reason: z.string().optional().default(''),
      }),
    )
    .min(1)
    .max(15),
  notes: z.string().optional().default(''),
});
export type WorkoutRecommendation = z.infer<typeof workoutRecommendationSchema>;

export const nutritionRecommendationSchema = z.object({
  summary: z.string(),
  suggestions: z
    .array(
      z.object({
        food: z.string(),
        reason: z.string(),
        estimatedProtein: z.number().min(0).max(500).default(0),
        estimatedCalories: z.number().min(0).max(5000).default(0),
      }),
    )
    .max(10)
    .default([]),
});
export type NutritionRecommendation = z.infer<typeof nutritionRecommendationSchema>;

export const dailyInsightSchema = z.object({
  insight: z.string(),
  focus: z.string().optional().default(''),
});
export type DailyInsight = z.infer<typeof dailyInsightSchema>;

export const substitutionSchema = z.object({
  alternatives: z
    .array(
      z.object({
        exerciseId: z.string(),
        reason: z.string().optional().default(''),
      }),
    )
    .max(6)
    .default([]),
});
export type Substitution = z.infer<typeof substitutionSchema>;

export const recoverySchema = z.object({
  summary: z.string(),
  recommendedFocusMuscles: z.array(z.string()).max(6).default([]),
  musclesToRest: z.array(z.string()).max(6).default([]),
});
export type Recovery = z.infer<typeof recoverySchema>;

export const progressAnalysisSchema = z.object({
  summary: z.string(),
  highlights: z.array(z.string()).max(6).default([]),
  suggestions: z.array(z.string()).max(6).default([]),
});
export type ProgressAnalysis = z.infer<typeof progressAnalysisSchema>;

/** Gemini responseSchema equivalents (Type-based) for structured output. */
export const geminiSchemas = {
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
} as const;

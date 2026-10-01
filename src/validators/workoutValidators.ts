import { z } from 'zod';
import { EXERCISE_TYPES, MUSCLE_GROUPS, WORKOUT_STATUSES } from '../models/domain.js';

const setSchema = z.object({
  setNumber: z.number().int().min(1),
  weightKg: z.number().min(0).max(1000).nullable().optional(),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  distanceM: z.number().min(0).max(1_000_000).nullable().optional(),
  durationSeconds: z.number().int().min(0).max(86_400).nullable().optional(),
  calories: z.number().min(0).max(20_000).nullable().optional(),
  completed: z.boolean().default(false),
});

const workoutExerciseSchema = z.object({
  exerciseId: z.string().min(1).max(200),
  order: z.number().int().min(0),
  notes: z.string().max(1000).nullable().optional(),
  primaryMuscle: z.enum(MUSCLE_GROUPS).optional(),
  // Unlimited sets — no fixed count.
  sets: z.array(setSchema).max(50).default([]),
});

/** Create/update payload for a workout (also used for templates). */
export const workoutUpsertSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(EXERCISE_TYPES).default('strength'),
  isTemplate: z.boolean().default(false),
  notes: z.string().max(2000).nullable().optional(),
  exercises: z.array(workoutExerciseSchema).max(60).default([]),
});

/** Status transition payload. */
export const workoutStatusSchema = z.object({
  status: z.enum(WORKOUT_STATUSES),
});

export const workoutListQuerySchema = z.object({
  status: z.enum(WORKOUT_STATUSES).optional(),
  isTemplate: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const workoutIdParamsSchema = z.object({ id: z.string().min(1).max(200) });

export type WorkoutUpsertInput = z.infer<typeof workoutUpsertSchema>;
export type WorkoutStatusInput = z.infer<typeof workoutStatusSchema>;

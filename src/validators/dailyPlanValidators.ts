import { z } from 'zod';
import { MUSCLE_GROUPS, WORKOUT_LOCATIONS } from '../models/domain.js';

/** yyyy-MM-dd date key (optional; defaults to today server-side). */
const dateKeyField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Expected date in yyyy-MM-dd format')
  .optional();

/** Query for GET /api/ai/daily-plan. */
export const dailyPlanQuerySchema = z.object({ date: dateKeyField });

/** Body for POST /api/ai/daily-plan/generate (create-once-and-persist). */
export const dailyPlanGenerateSchema = z.object({
  date: dateKeyField,
  location: z.enum(WORKOUT_LOCATIONS).optional(),
  muscle: z.enum(MUSCLE_GROUPS).optional(),
  durationMinutes: z.number().int().min(10).max(180).optional(),
  /** When true, regenerate even if a plan already exists for the date. */
  force: z.boolean().optional(),
});

const planExerciseSchema = z.object({
  exerciseId: z.string().min(1).max(200),
  sets: z.number().int().min(1).max(12),
  repMin: z.number().int().min(1).max(100),
  repMax: z.number().int().min(1).max(100),
  restSeconds: z.number().int().min(0).max(600),
  reason: z.string().max(300).optional().default(''),
});

/**
 * Body for PUT /api/ai/daily-plan. Two mutually-useful modes:
 *  - Provide `exercises` to save an explicit structured plan (user-edited).
 *  - Provide `muscleGroups` (and optional focus) with no `exercises` to have
 *    the backend regenerate exercises for those muscles and persist them.
 * Either way the result becomes the single persisted plan for the date.
 */
export const dailyPlanUpdateSchema = z.object({
  date: dateKeyField,
  title: z.string().min(1).max(120).optional(),
  goal: z.string().max(120).optional(),
  durationMinutes: z.number().int().min(5).max(240).optional(),
  muscleGroups: z.array(z.enum(MUSCLE_GROUPS)).max(6).optional(),
  location: z.enum(WORKOUT_LOCATIONS).optional(),
  exercises: z.array(planExerciseSchema).min(1).max(15).optional(),
  notes: z.string().max(1000).optional(),
});

export type DailyPlanGenerateInput = z.infer<typeof dailyPlanGenerateSchema>;
export type DailyPlanUpdateInput = z.infer<typeof dailyPlanUpdateSchema>;

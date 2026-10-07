import { z } from 'zod';
import {
  ACTIVITY_LEVELS,
  DIFFICULTIES,
  EQUIPMENT,
  GENDERS,
  GOALS,
  WORKOUT_LOCATIONS,
} from '../models/domain.js';
import { commonSchemas } from '../middleware/validate.js';

const fitnessLevel = z.enum(DIFFICULTIES);

/** A single user-defined meal: a name/type and a HH:mm time. */
const mealEntrySchema = z.object({
  name: z.string().min(1).max(60),
  time: commonSchemas.timeOfDay,
});

const lifestyleSchema = z.object({
  wakeTime: commonSchemas.timeOfDay,
  sleepTime: commonSchemas.timeOfDay,
  breakfastTime: commonSchemas.timeOfDay,
  lunchTime: commonSchemas.timeOfDay,
  dinnerTime: commonSchemas.timeOfDay,
  snackTimes: z.array(commonSchemas.timeOfDay).max(6).default([]),
  waterReminderMinutes: z.number().int().min(15).max(480).default(90),
  // Flexible, user-controlled meal schedule. Optional for backward
  // compatibility with clients/profiles that only send the fixed fields.
  meals: z.array(mealEntrySchema).max(20).optional(),
});

const targetsSchema = z.object({
  calories: z.number().int().min(1000).max(8000),
  protein: z.number().int().min(0).max(500),
  carbs: z.number().int().min(0).max(1200),
  fat: z.number().int().min(0).max(400),
  waterMl: z.number().int().min(500).max(10000),
  isCustom: z.boolean().default(true),
});

/**
 * Profile upsert schema. `dateOfBirth` is an ISO date string.
 * `targets` is optional — when omitted (or isCustom=false) the backend
 * recomputes estimates from the profile fields.
 */
export const profileUpsertSchema = z.object({
  name: z.string().min(1).max(80),
  photoUrl: z.string().url().max(2000).optional().nullable(),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.string().date()),
  gender: z.enum(GENDERS),
  heightCm: z.number().min(80).max(260),
  weightKg: z.number().min(25).max(400),
  fitnessLevel,
  goals: z.array(z.enum(GOALS)).min(1).max(4),
  activityLevel: z.enum(ACTIVITY_LEVELS),
  workoutDaysPerWeek: z.number().int().min(0).max(7),
  preferredWorkoutTime: commonSchemas.timeOfDay,
  workoutLocation: z.enum(WORKOUT_LOCATIONS),
  equipment: z.array(z.enum(EQUIPMENT)).default([]),
  lifestyle: lifestyleSchema,
  targets: targetsSchema.optional(),
  units: z.enum(['metric', 'imperial']).default('metric'),
  // Trainer association (mirrored from trainerLinks by the backend). Optional
  // and nullable so independent students and all existing/onboarding upserts
  // stay valid; the authoritative relationship lives in trainerLinks.
  trainerId: z.string().min(1).max(128).optional().nullable(),
  // Whether the student has opted to share progress (incl. photos) with their
  // trainer. Optional for backward compatibility; defaults to sharing on when
  // a trainer link exists is handled server-side.
  shareProgressWithTrainer: z.boolean().optional(),
  // User-defined nutrition meals (e.g. "Pre-workout", "Evening snack").
  // Each has a STABLE id so renaming only changes `name` and existing food
  // logs (tagged with the meal's id) stay associated. Optional + backward
  // compatible: a legacy string[] form is also accepted (coerced to {id,name}).
  // Built-in meals (breakfast/lunch/dinner/snack) are not stored here.
  customMeals: z
    .array(
      z.union([
        z.object({ id: z.string().min(1).max(80), name: z.string().min(1).max(60) }),
        z.string().min(1).max(60),
      ]),
    )
    .max(20)
    .optional(),
});

export type ProfileUpsertInput = z.infer<typeof profileUpsertSchema>;

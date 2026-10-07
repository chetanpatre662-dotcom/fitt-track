import { z } from 'zod';
import { commonSchemas } from '../middleware/validate.js';

/**
 * Validators for the trainer/student slice. Referral codes are trimmed and
 * lowercased here so lookup/normalization is consistent across the system
 * (codes are structurally capable of future unique per-trainer values even
 * though the only seeded code today is 'dreamphysics').
 */
export const linkTrainerSchema = z.object({
  referralCode: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40),
});

/** Path param for per-student trainer routes. */
export const studentUidParamsSchema = z.object({
  studentUid: z.string().min(1).max(128),
});

/** Optional ?date=yyyy-MM-dd query for day-scoped reads. */
export const dateQuerySchema = z.object({
  date: commonSchemas.dateKey.optional(),
});

/** Optional ?limit= for history reads (1..365). */
export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(365).optional(),
});

/** Body for the student's progress-sharing toggle. */
export const sharingPatchSchema = z.object({
  shareProgressWithTrainer: z.boolean(),
});

export type LinkTrainerInput = z.infer<typeof linkTrainerSchema>;
export type SharingPatchInput = z.infer<typeof sharingPatchSchema>;

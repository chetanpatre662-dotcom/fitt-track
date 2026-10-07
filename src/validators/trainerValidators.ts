import { z } from 'zod';
import { commonSchemas } from '../middleware/validate.js';

/**
 * Validators for the trainer/student slice. Referral codes are trimmed and
 * lowercased for the connect path so lookup/normalization is consistent across
 * the system. Each trainer owns a unique, dynamically generated or custom code;
 * there is no single globally fixed code.
 */
export const linkTrainerSchema = z.object({
  referralCode: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40),
  /** Explicit intent to move an already-linked student to a new trainer. */
  confirmSwitch: z.boolean().optional(),
});

/**
 * Reserved words that may never be claimed as a referral code. `dreamphysics`
 * is reserved so that, after the legacy trainer migrates off it, no OTHER
 * trainer can re-claim it (the legacy doc is grandfathered by the migration and
 * stays owned by its original trainer; the reserved list governs only NEW
 * claims).
 */
const RESERVED_CODES = new Set([
  'admin',
  'trainer',
  'fittrack',
  'support',
  'null',
  'undefined',
  'dreamphysics',
]);

const codeFormat = z
  .string()
  .trim()
  .min(4)
  .max(20)
  .regex(/^[A-Za-z0-9]+$/u, 'Only letters and digits are allowed (no spaces or symbols).')
  .refine((code) => !RESERVED_CODES.has(code.toLowerCase()), {
    message: 'That code is reserved.',
  });

/**
 * Body schema for creating/changing a custom referral code. The display casing
 * the trainer chose is preserved; normalization to the lowercase index key
 * happens in the service.
 */
export const referralCodeSchema = z.object({
  code: codeFormat,
});

/** Query schema for the availability check (same format rules as a custom code). */
export const availabilityQuerySchema = z.object({
  code: codeFormat,
});

/**
 * Body schema for trainer self-registration. There is deliberately NO
 * referral-code field — choosing a TRAINER account must never require a code.
 * email/photoUrl are taken from the verified token server-side, not the body.
 */
export const registerTrainerSchema = z.object({
  name: z.string().trim().min(1).max(80),
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
export type ReferralCodeInput = z.infer<typeof referralCodeSchema>;
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
export type RegisterTrainerInput = z.infer<typeof registerTrainerSchema>;

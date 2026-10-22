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

/**
 * An optional social URL: either an empty string (cleared) OR an absolute
 * `https://` URL (any other scheme — `http:`, `javascript:`, etc. — is
 * rejected). Trimmed; max 300 chars. Host is intentionally NOT restricted to
 * specific domains in v1 (trainers legitimately use youtu.be, vanity hosts and
 * regional Instagram hosts). The client additionally re-checks the `https`
 * scheme before launching.
 */
const socialUrl = z
  .string()
  .trim()
  .max(300)
  .refine(
    (value) => {
      if (value.length === 0) return true;
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        return false;
      }
      return parsed.protocol === 'https:';
    },
    { message: 'Must be an absolute https:// URL.' },
  )
  .optional();

/**
 * Body schema for PATCH /api/trainer/profile (trainer-only, owner self-edit).
 * Private fields: `mobile`, `dateOfBirth`, `heightCm`, `weightKg` — stored on
 * trainers/{uid} but NEVER surfaced by the student-facing projection.
 * Public fields: `experience`, `bio`, `youtubeUrl`, `instagramUrl`.
 *
 * The required set for `profileCompleted` (name, mobile, dateOfBirth, heightCm,
 * weightKg, experience) is checked SEPARATELY by the service — in this base
 * schema every field is optional so a partial edit of an already-saved profile
 * never fails. In particular `experience` is optional (0..80, NOT `.min(1)`)
 * here even though it is required for completeness.
 */
export const trainerProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    mobile: z
      .string()
      .trim()
      .regex(
        /^[+]?[0-9 ()-]{7,20}$/u,
        'Enter a valid phone number (7-20 digits, may start with +).',
      )
      .optional(),
    dateOfBirth: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Use the format YYYY-MM-DD.')
      .refine((value) => {
        // A real calendar date (round-trips) in the past, with age >= 13.
        const date = new Date(`${value}T00:00:00.000Z`);
        if (Number.isNaN(date.getTime())) return false;
        if (date.toISOString().slice(0, 10) !== value) return false;
        const now = new Date();
        if (date.getTime() >= now.getTime()) return false;
        const thirteenthBirthday = new Date(
          Date.UTC(
            date.getUTCFullYear() + 13,
            date.getUTCMonth(),
            date.getUTCDate(),
          ),
        );
        return thirteenthBirthday.getTime() <= now.getTime();
      }, 'You must be at least 13 years old.')
      .optional(),
    heightCm: z.number().min(50).max(300).optional(),
    weightKg: z.number().min(20).max(500).optional(),
    experience: z.string().trim().max(80).optional(),
    bio: z.string().trim().max(500).optional(),
    youtubeUrl: socialUrl,
    instagramUrl: socialUrl,
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one profile field is required.',
  });

export type TrainerProfileInput = z.infer<typeof trainerProfileSchema>;

/**
 * Query schema for GET /api/student/trainer/preview?code= — a public-by-code
 * read used by the QR scan / manual-entry connect flow. Trimmed + lowercased to
 * match the normalized referral-code index key. NOT reusing linkTrainerSchema:
 * that validates a BODY field named `referralCode`, this is a query `code`.
 */
export const trainerPreviewQuerySchema = z.object({
  code: z.string().trim().toLowerCase().min(3).max(40),
});

export type TrainerPreviewQueryInput = z.infer<typeof trainerPreviewQuerySchema>;

/** Path param for per-student trainer routes. */
export const studentUidParamsSchema = z.object({
  studentUid: z.string().min(1).max(128),
});

/**
 * Path params for the single-workout detail read
 * (GET /trainer/students/:studentUid/workouts/:workoutId). Extends the
 * student-uid params with a bounded workoutId so the route is validated the
 * same way as the other per-student routes.
 */
export const workoutDetailParamsSchema = studentUidParamsSchema.extend({
  workoutId: z.string().min(1).max(128),
});

/**
 * Body schema for the batch request actions (FEAT-003:
 * POST /trainer/requests/batch/approve|reject). A non-empty array of student
 * uids; the service de-duplicates and revalidates each entry server-side before
 * acting. The array is de-duplicated BEFORE the `.max(50)` bound is checked, so
 * the bound (and every summary count downstream) is applied to the unique set
 * and a caller cannot bypass it by repeating the same uid.
 */
export const batchStudentUidsSchema = z.object({
  studentUids: z
    .array(z.string().min(1))
    .nonempty()
    .transform((uids) => [...new Set(uids)])
    .refine((uids) => uids.length <= 50, {
      message: 'At most 50 unique student ids are allowed.',
    }),
});

export type BatchStudentUidsInput = z.infer<typeof batchStudentUidsSchema>;

/** Optional ?date=yyyy-MM-dd query for day-scoped reads. */
export const dateQuerySchema = z.object({
  date: commonSchemas.dateKey.optional(),
});

/**
 * Query for paginated history reads: an optional ?limit= page size (1..100) and
 * an optional ?cursor= — the ISO `startedAt` of the last item from the previous
 * page, used to fetch the next newest-first page via the startedAt-DESC cursor
 * query. Both are optional (first page with the default size when omitted).
 */
export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(64).optional(),
});

/** Body for the student's progress-sharing toggle. */
export const sharingPatchSchema = z.object({
  shareProgressWithTrainer: z.boolean(),
});

/**
 * The per-category sharing map keys, in a stable order. Each category gates one
 * group of trainer per-student reads; see trainerService.isShared for the
 * category->loader mapping. `progressPhotos` is the legacy category: the old
 * boolean `shareProgressWithTrainer` maps onto it for backward compatibility.
 */
export const SHARING_CATEGORIES = [
  'workoutHistory',
  'nutrition',
  'measurements',
  'progressPhotos',
  'progressReports',
] as const;

export type SharingCategory = (typeof SHARING_CATEGORIES)[number];

/**
 * Unified body schema for PATCH /student/trainer/sharing. Accepts EITHER the
 * legacy boolean `shareProgressWithTrainer` OR any subset of the five granular
 * category booleans (the controller enforces the mutual-exclusion/precedence
 * rule: granular-only, legacy-only, or 400 when both are present). `.strict()`
 * rejects unknown keys; `.refine` rejects an empty body. Deliberately NOT a
 * z.union — a single flat object keeps the error shape predictable.
 */
export const sharingPatchUnifiedSchema = z
  .object({
    shareProgressWithTrainer: z.boolean().optional(),
    workoutHistory: z.boolean().optional(),
    nutrition: z.boolean().optional(),
    measurements: z.boolean().optional(),
    progressPhotos: z.boolean().optional(),
    progressReports: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one sharing field is required.',
  });

/**
 * Body schema for POST /trainer/students/:studentUid/diet-plan. A trainer may
 * assign a text plan, an uploaded image (by its Storage path), or both — but at
 * least one must be present (an empty body is a 400). `null` is accepted for
 * either field so a trainer can explicitly clear text or the image. The
 * service enforces the path-ownership guard; `.strict()` rejects unknown keys.
 */
export const dietPlanUpsertSchema = z
  .object({
    text: z.string().max(5000).nullable().optional(),
    imageStoragePath: z.string().min(1).max(500).nullable().optional(),
    // How to treat the stored image on this upsert:
    //   'keep'    -> leave the existing image untouched (no delete) — a text-only
    //                edit must NOT drop an attached photo.
    //   'replace' -> a new image was uploaded (imageStoragePath carries its path).
    //   'remove'  -> clear the image and best-effort delete the Storage object.
    // Absent -> legacy behaviour (image follows imageStoragePath; a missing path
    // clears+deletes), kept for backward compatibility.
    imageAction: z.enum(['keep', 'replace', 'remove']).optional(),
  })
  .strict()
  .refine(
    (body) =>
      (typeof body.text === 'string' && body.text.length > 0) ||
      (typeof body.imageStoragePath === 'string' && body.imageStoragePath.length > 0) ||
      body.imageAction === 'keep',
    { message: 'A diet plan needs text or an image.' },
  );

export type DietPlanUpsertInput = z.infer<typeof dietPlanUpsertSchema>;

/**
 * Body schema for POST /trainer/students/:studentUid/workouts/assign. A trainer
 * schedules a named workout for a date with 1..60 exercise lines, each carrying
 * target sets/reps/weight. `scheduledDate` reuses the shared yyyy-MM-dd key.
 * targetWeightKg is optional/nullable (bodyweight moves have no load). No
 * exercise-library existence check happens here — only shape/limits (the
 * exerciseId is a free string the client sources from the picker). `.strict()`
 * rejects unknown keys on both the body and each exercise.
 */
export const assignWorkoutExerciseSchema = z
  .object({
    exerciseId: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(120),
    targetSets: z.number().int().min(1).max(50),
    targetReps: z.number().int().min(0).max(1000),
    targetWeightKg: z.number().min(0).max(2000).nullable().optional(),
  })
  .strict();

export const assignWorkoutSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    scheduledDate: commonSchemas.dateKey,
    exercises: z.array(assignWorkoutExerciseSchema).min(1).max(60),
  })
  .strict();

export type AssignWorkoutInput = z.infer<typeof assignWorkoutSchema>;

export type LinkTrainerInput = z.infer<typeof linkTrainerSchema>;
export type SharingPatchInput = z.infer<typeof sharingPatchSchema>;
export type SharingPatchUnifiedInput = z.infer<typeof sharingPatchUnifiedSchema>;
export type ReferralCodeInput = z.infer<typeof referralCodeSchema>;
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
export type RegisterTrainerInput = z.infer<typeof registerTrainerSchema>;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignWorkoutSchema = exports.assignWorkoutExerciseSchema = exports.dietPlanUpsertSchema = exports.sharingPatchUnifiedSchema = exports.SHARING_CATEGORIES = exports.sharingPatchSchema = exports.historyQuerySchema = exports.dateQuerySchema = exports.batchStudentUidsSchema = exports.workoutDetailParamsSchema = exports.studentUidParamsSchema = exports.trainerPreviewQuerySchema = exports.trainerProfileSchema = exports.registerTrainerSchema = exports.availabilityQuerySchema = exports.referralCodeSchema = exports.linkTrainerSchema = void 0;
const zod_1 = require("zod");
const validate_js_1 = require("../middleware/validate.js");
/**
 * Validators for the trainer/student slice. Referral codes are trimmed and
 * lowercased for the connect path so lookup/normalization is consistent across
 * the system. Each trainer owns a unique, dynamically generated or custom code;
 * there is no single globally fixed code.
 */
exports.linkTrainerSchema = zod_1.z.object({
    referralCode: zod_1.z
        .string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(40),
    /** Explicit intent to move an already-linked student to a new trainer. */
    confirmSwitch: zod_1.z.boolean().optional(),
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
const codeFormat = zod_1.z
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
exports.referralCodeSchema = zod_1.z.object({
    code: codeFormat,
});
/** Query schema for the availability check (same format rules as a custom code). */
exports.availabilityQuerySchema = zod_1.z.object({
    code: codeFormat,
});
/**
 * Body schema for trainer self-registration. There is deliberately NO
 * referral-code field — choosing a TRAINER account must never require a code.
 * email/photoUrl are taken from the verified token server-side, not the body.
 */
exports.registerTrainerSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(80),
});
/**
 * An optional social URL: either an empty string (cleared) OR an absolute
 * `https://` URL (any other scheme — `http:`, `javascript:`, etc. — is
 * rejected). Trimmed; max 300 chars. Host is intentionally NOT restricted to
 * specific domains in v1 (trainers legitimately use youtu.be, vanity hosts and
 * regional Instagram hosts). The client additionally re-checks the `https`
 * scheme before launching.
 */
const socialUrl = zod_1.z
    .string()
    .trim()
    .max(300)
    .refine((value) => {
    if (value.length === 0)
        return true;
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        return false;
    }
    return parsed.protocol === 'https:';
}, { message: 'Must be an absolute https:// URL.' })
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
exports.trainerProfileSchema = zod_1.z
    .object({
    name: zod_1.z.string().trim().min(1).max(80).optional(),
    mobile: zod_1.z
        .string()
        .trim()
        .regex(/^\d{10}$/u, 'Enter a 10-digit mobile number.')
        .optional(),
    dateOfBirth: zod_1.z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Use the format YYYY-MM-DD.')
        .refine((value) => {
        // A real calendar date (round-trips) in the past, with age >= 13.
        const date = new Date(`${value}T00:00:00.000Z`);
        if (Number.isNaN(date.getTime()))
            return false;
        if (date.toISOString().slice(0, 10) !== value)
            return false;
        const now = new Date();
        if (date.getTime() >= now.getTime())
            return false;
        const thirteenthBirthday = new Date(Date.UTC(date.getUTCFullYear() + 13, date.getUTCMonth(), date.getUTCDate()));
        return thirteenthBirthday.getTime() <= now.getTime();
    }, 'You must be at least 13 years old.')
        .optional(),
    heightCm: zod_1.z.number().min(50).max(300).optional(),
    weightKg: zod_1.z.number().min(20).max(500).optional(),
    experience: zod_1.z.string().trim().max(80).optional(),
    bio: zod_1.z.string().trim().max(500).optional(),
    youtubeUrl: socialUrl,
    instagramUrl: socialUrl,
})
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one profile field is required.',
});
/**
 * Query schema for GET /api/student/trainer/preview?code= — a public-by-code
 * read used by the QR scan / manual-entry connect flow. Trimmed + lowercased to
 * match the normalized referral-code index key. NOT reusing linkTrainerSchema:
 * that validates a BODY field named `referralCode`, this is a query `code`.
 */
exports.trainerPreviewQuerySchema = zod_1.z.object({
    code: zod_1.z.string().trim().toLowerCase().min(3).max(40),
});
/** Path param for per-student trainer routes. */
exports.studentUidParamsSchema = zod_1.z.object({
    studentUid: zod_1.z.string().min(1).max(128),
});
/**
 * Path params for the single-workout detail read
 * (GET /trainer/students/:studentUid/workouts/:workoutId). Extends the
 * student-uid params with a bounded workoutId so the route is validated the
 * same way as the other per-student routes.
 */
exports.workoutDetailParamsSchema = exports.studentUidParamsSchema.extend({
    workoutId: zod_1.z.string().min(1).max(128),
});
/**
 * Body schema for the batch request actions (FEAT-003:
 * POST /trainer/requests/batch/approve|reject). A non-empty array of student
 * uids; the service de-duplicates and revalidates each entry server-side before
 * acting. The array is de-duplicated BEFORE the `.max(50)` bound is checked, so
 * the bound (and every summary count downstream) is applied to the unique set
 * and a caller cannot bypass it by repeating the same uid.
 */
exports.batchStudentUidsSchema = zod_1.z.object({
    studentUids: zod_1.z
        .array(zod_1.z.string().min(1))
        .nonempty()
        .transform((uids) => [...new Set(uids)])
        .refine((uids) => uids.length <= 50, {
        message: 'At most 50 unique student ids are allowed.',
    }),
});
/** Optional ?date=yyyy-MM-dd query for day-scoped reads. */
exports.dateQuerySchema = zod_1.z.object({
    date: validate_js_1.commonSchemas.dateKey.optional(),
});
/**
 * Query for paginated history reads: an optional ?limit= page size (1..100) and
 * an optional ?cursor= — the ISO `startedAt` of the last item from the previous
 * page, used to fetch the next newest-first page via the startedAt-DESC cursor
 * query. Both are optional (first page with the default size when omitted).
 */
exports.historyQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional(),
    cursor: zod_1.z.string().min(1).max(64).optional(),
});
/** Body for the student's progress-sharing toggle. */
exports.sharingPatchSchema = zod_1.z.object({
    shareProgressWithTrainer: zod_1.z.boolean(),
});
/**
 * The per-category sharing map keys, in a stable order. Each category gates one
 * group of trainer per-student reads; see trainerService.isShared for the
 * category->loader mapping. `progressPhotos` is the legacy category: the old
 * boolean `shareProgressWithTrainer` maps onto it for backward compatibility.
 */
exports.SHARING_CATEGORIES = [
    'workoutHistory',
    'nutrition',
    'measurements',
    'progressPhotos',
    'progressReports',
];
/**
 * Unified body schema for PATCH /student/trainer/sharing. Accepts EITHER the
 * legacy boolean `shareProgressWithTrainer` OR any subset of the five granular
 * category booleans (the controller enforces the mutual-exclusion/precedence
 * rule: granular-only, legacy-only, or 400 when both are present). `.strict()`
 * rejects unknown keys; `.refine` rejects an empty body. Deliberately NOT a
 * z.union — a single flat object keeps the error shape predictable.
 */
exports.sharingPatchUnifiedSchema = zod_1.z
    .object({
    shareProgressWithTrainer: zod_1.z.boolean().optional(),
    workoutHistory: zod_1.z.boolean().optional(),
    nutrition: zod_1.z.boolean().optional(),
    measurements: zod_1.z.boolean().optional(),
    progressPhotos: zod_1.z.boolean().optional(),
    progressReports: zod_1.z.boolean().optional(),
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
exports.dietPlanUpsertSchema = zod_1.z
    .object({
    text: zod_1.z.string().max(5000).nullable().optional(),
    imageStoragePath: zod_1.z.string().min(1).max(500).nullable().optional(),
    // How to treat the stored image on this upsert:
    //   'keep'    -> leave the existing image untouched (no delete) — a text-only
    //                edit must NOT drop an attached photo.
    //   'replace' -> a new image was uploaded (imageStoragePath carries its path).
    //   'remove'  -> clear the image and best-effort delete the Storage object.
    // Absent -> legacy behaviour (image follows imageStoragePath; a missing path
    // clears+deletes), kept for backward compatibility.
    imageAction: zod_1.z.enum(['keep', 'replace', 'remove']).optional(),
})
    .strict()
    .refine((body) => (typeof body.text === 'string' && body.text.length > 0) ||
    (typeof body.imageStoragePath === 'string' && body.imageStoragePath.length > 0) ||
    body.imageAction === 'keep', { message: 'A diet plan needs text or an image.' });
/**
 * Body schema for POST /trainer/students/:studentUid/workouts/assign. A trainer
 * schedules a named workout for a date with 1..60 exercise lines, each carrying
 * target sets/reps/weight. `scheduledDate` reuses the shared yyyy-MM-dd key.
 * targetWeightKg is optional/nullable (bodyweight moves have no load). No
 * exercise-library existence check happens here — only shape/limits (the
 * exerciseId is a free string the client sources from the picker). `.strict()`
 * rejects unknown keys on both the body and each exercise.
 */
exports.assignWorkoutExerciseSchema = zod_1.z
    .object({
    exerciseId: zod_1.z.string().min(1).max(128),
    name: zod_1.z.string().trim().min(1).max(120),
    targetSets: zod_1.z.number().int().min(1).max(50),
    targetReps: zod_1.z.number().int().min(0).max(1000),
    targetWeightKg: zod_1.z.number().min(0).max(2000).nullable().optional(),
})
    .strict();
exports.assignWorkoutSchema = zod_1.z
    .object({
    name: zod_1.z.string().trim().min(1).max(120),
    scheduledDate: validate_js_1.commonSchemas.dateKey,
    exercises: zod_1.z.array(exports.assignWorkoutExerciseSchema).min(1).max(60),
})
    .strict();
//# sourceMappingURL=trainerValidators.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sharingPatchSchema = exports.historyQuerySchema = exports.dateQuerySchema = exports.studentUidParamsSchema = exports.linkTrainerSchema = void 0;
const zod_1 = require("zod");
const validate_js_1 = require("../middleware/validate.js");
/**
 * Validators for the trainer/student slice. Referral codes are trimmed and
 * lowercased here so lookup/normalization is consistent across the system
 * (codes are structurally capable of future unique per-trainer values even
 * though the only seeded code today is 'dreamphysics').
 */
exports.linkTrainerSchema = zod_1.z.object({
    referralCode: zod_1.z
        .string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(40),
});
/** Path param for per-student trainer routes. */
exports.studentUidParamsSchema = zod_1.z.object({
    studentUid: zod_1.z.string().min(1).max(128),
});
/** Optional ?date=yyyy-MM-dd query for day-scoped reads. */
exports.dateQuerySchema = zod_1.z.object({
    date: validate_js_1.commonSchemas.dateKey.optional(),
});
/** Optional ?limit= for history reads (1..365). */
exports.historyQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().min(1).max(365).optional(),
});
/** Body for the student's progress-sharing toggle. */
exports.sharingPatchSchema = zod_1.z.object({
    shareProgressWithTrainer: zod_1.z.boolean(),
});
//# sourceMappingURL=trainerValidators.js.map
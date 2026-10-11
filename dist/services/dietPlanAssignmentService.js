"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dietPlanAssignmentService = exports.DietPlanAssignmentService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const dietPlanRepository_js_1 = require("../repositories/dietPlanRepository.js");
const trainerLinkRepository_js_1 = require("../repositories/trainerLinkRepository.js");
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
/** TTL for the student-facing diet-plan image signed URL (15 minutes). */
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;
/**
 * Trainer-assigned diet plans. The plan document lives at dietPlans/{studentUid}
 * (Admin-SDK-only). The image bytes live in Firebase Storage under the
 * trainer's OWN users/{trainerId}/dietPlans/{studentUid}/ prefix (allowed by
 * the existing owner-only storage.rules). A student never reads that path
 * directly: the backend bridges it with a short-lived signed READ url placed in
 * `imageUrl`, exactly mirroring progressPhotoService's signing mechanism, so
 * storage.rules stays unchanged and no client-direct cross-user Storage read is
 * introduced.
 */
class DietPlanAssignmentService {
    /**
     * Validates that `storagePath` is inside the trainer's own
     * users/{trainerId}/dietPlans/{studentUid}/ folder and free of traversal.
     * Mirrors progressPhotoService.assertOwnedPath so a trainer can never point a
     * student's plan at another user's object.
     */
    assertOwnedPath(trainerId, studentUid, storagePath) {
        const prefix = `users/${trainerId}/dietPlans/${studentUid}/`;
        if (!storagePath.startsWith(prefix) || storagePath.includes('..')) {
            throw new errors_js_1.BadRequestError('Invalid storage path for this diet plan.');
        }
    }
    /**
     * Upserts the student's diet plan on behalf of `trainerId`. Replaces any
     * prior plan in whole: when a new image replaces an existing one (different
     * path), the old object is best-effort deleted so no orphan is left; when the
     * caller omits the image, the stored image path is cleared. The caller is
     * expected to have already asserted trainer ownership of the student.
     */
    async assignForStudent(trainerId, studentUid, input) {
        const text = typeof input.text === 'string' && input.text.length > 0 ? input.text : null;
        const imageStoragePath = typeof input.imageStoragePath === 'string' && input.imageStoragePath.length > 0
            ? input.imageStoragePath
            : null;
        if (imageStoragePath) {
            this.assertOwnedPath(trainerId, studentUid, imageStoragePath);
        }
        const existing = await dietPlanRepository_js_1.dietPlanRepository.get(studentUid);
        const previousPath = existing?.imageStoragePath ?? null;
        const saved = await dietPlanRepository_js_1.dietPlanRepository.upsert(studentUid, {
            trainerId,
            studentUid,
            text,
            imageStoragePath,
            ...(existing ? {} : { createdAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() }),
        });
        // Best-effort cleanup: drop a replaced/removed image object so Storage does
        // not accumulate orphans. Never fatal — the plan write is authoritative.
        if (previousPath && previousPath !== imageStoragePath) {
            try {
                await (0, firebase_js_1.getBucket)().file(previousPath).delete({ ignoreNotFound: true });
            }
            catch (err) {
                logger_js_1.logger.warn({ err, trainerId }, 'Failed to delete replaced diet-plan image (continuing)');
            }
        }
        return this.resolve(saved);
    }
    /**
     * Returns the student's own diet plan, but ONLY when the caller currently has
     * an ACTIVE trainer link AND the stored plan was assigned by that same active
     * trainer. A stale plan (assigned by a previous trainer) or any
     * inactive/pending link yields {text:null, imageUrl:null} so a student never
     * sees a plan from a trainer they are no longer connected to.
     */
    async getForStudent(studentUid) {
        const link = await trainerLinkRepository_js_1.trainerLinkRepository.get(studentUid);
        if (!link || link.status !== 'active')
            return null;
        const activeTrainerId = link.trainerId;
        const plan = await dietPlanRepository_js_1.dietPlanRepository.get(studentUid);
        if (!plan || !activeTrainerId || plan.trainerId !== activeTrainerId)
            return null;
        return this.resolve(plan);
    }
    /**
     * Returns the diet plan a trainer previously assigned to one of their own
     * students, so the trainer UI can display the saved text/photo across
     * sessions. Returns null when no plan exists or the stored plan was assigned
     * by a different trainer. The caller is expected to have already asserted
     * trainer ownership of the student.
     */
    async getForTrainer(trainerId, studentUid) {
        const plan = await dietPlanRepository_js_1.dietPlanRepository.get(studentUid);
        if (plan && plan.trainerId === trainerId)
            return this.resolve(plan);
        return null;
    }
    /**
     * Shapes a stored plan doc into the client response, signing a short-lived
     * READ url for the image when present. Signing is best-effort: a failure
     * yields imageUrl:null (warn log) while the text is still returned, exactly
     * like progressPhotoService.
     */
    async resolve(plan) {
        const text = plan.text ?? null;
        const imageStoragePath = plan.imageStoragePath ?? null;
        let imageUrl = null;
        if (imageStoragePath) {
            try {
                const [signed] = await (0, firebase_js_1.getBucket)()
                    .file(imageStoragePath)
                    .getSignedUrl({ action: 'read', expires: Date.now() + SIGNED_URL_TTL_MS });
                imageUrl = signed;
            }
            catch (err) {
                logger_js_1.logger.warn({ err }, 'Failed to sign diet-plan image URL (continuing)');
            }
        }
        return { text, imageUrl, updatedAt: toIso(plan.updatedAt) };
    }
}
exports.DietPlanAssignmentService = DietPlanAssignmentService;
function toIso(value) {
    const t = value;
    if (t && typeof t.toDate === 'function')
        return t.toDate().toISOString();
    if (typeof value === 'string')
        return value;
    return null;
}
exports.dietPlanAssignmentService = new DietPlanAssignmentService();
//# sourceMappingURL=dietPlanAssignmentService.js.map
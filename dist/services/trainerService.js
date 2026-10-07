"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trainerService = exports.TrainerService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const trainerRepository_js_1 = require("../repositories/trainerRepository.js");
const trainerLinkRepository_js_1 = require("../repositories/trainerLinkRepository.js");
const profileRepository_js_1 = require("../repositories/profileRepository.js");
const workoutRepository_js_1 = require("../repositories/workoutRepository.js");
const nutritionService_js_1 = require("./nutritionService.js");
const waterService_js_1 = require("./waterService.js");
const progressService_js_1 = require("./progressService.js");
const progressPhotoService_js_1 = require("./progressPhotoService.js");
const roleService_js_1 = require("./roleService.js");
const role_js_1 = require("../middleware/role.js");
const errors_js_1 = require("../utils/errors.js");
/**
 * Trainer-side business logic: student linking, trainer profile/dashboard, and
 * per-student data views. Per-student views reuse the existing per-feature
 * services by passing the student's uid as the uid — authorization is enforced
 * by the caller (assertTrainerOwnsStudent) BEFORE any student data is read.
 */
class TrainerService {
    /**
     * Links the authenticated student to the trainer that owns `referralCode`.
     * - Unknown code -> soft success {linked:false, reason:'invalid_code'} (no
     *   link, so a typo never errors out registration).
     * - Trainer accounts cannot be linked as a student -> 409.
     * - Valid code -> transactionally create trainerLinks/{studentUid}, mirror
     *   profile.trainerId, and increment the trainer's totalStudents EXACTLY
     *   once (idempotent: a re-link to the same trainer does not double count).
     */
    async linkStudent(studentUid, referralCode) {
        const codeLower = referralCode.trim().toLowerCase();
        const trainerId = await trainerRepository_js_1.trainerRepository.findTrainerIdByReferralCode(codeLower);
        if (!trainerId) {
            return { linked: false, reason: 'invalid_code' };
        }
        const role = await roleService_js_1.roleService.resolveRole(studentUid);
        if (role === 'trainer') {
            throw new errors_js_1.ConflictError('Trainer accounts cannot be linked to another trainer.');
        }
        const db = (0, firebase_js_1.getFirestore)();
        const linkRef = trainerLinkRepository_js_1.trainerLinkRepository.doc(studentUid);
        const trainerRef = db.collection('trainers').doc(trainerId);
        const profileRef = db.collection('users').doc(studentUid).collection('profile').doc('data');
        await db.runTransaction(async (tx) => {
            const linkSnap = await tx.get(linkRef);
            const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
            const existing = linkSnap.exists ? linkSnap.data() : undefined;
            const alreadyActiveSameTrainer = existing?.trainerId === trainerId && existing?.status === 'active';
            tx.set(linkRef, {
                studentUid,
                trainerId,
                status: 'active',
                ...(linkSnap.exists ? {} : { createdAt: now }),
                updatedAt: now,
            }, { merge: true });
            // Mirror the association onto the student's profile (best-effort, kept in
            // sync here so the student app can show "My Trainer" without a join).
            tx.set(profileRef, { trainerId, updatedAt: now }, { merge: true });
            // Only increment when this is a brand-new active link to this trainer.
            if (!alreadyActiveSameTrainer) {
                tx.set(trainerRef, {
                    totalStudents: firebase_js_1.admin.firestore.FieldValue.increment(1),
                    updatedAt: now,
                }, { merge: true });
            }
        });
        const trainer = await trainerRepository_js_1.trainerRepository.get(trainerId);
        return {
            linked: true,
            trainerId,
            trainerName: trainer?.name ?? undefined,
        };
    }
    /** Trainer profile with an authoritative live active-student count. */
    async getProfile(trainerId) {
        const trainer = (await trainerRepository_js_1.trainerRepository.get(trainerId)) ?? { trainerId };
        const activeStudents = await trainerRepository_js_1.trainerRepository.countActiveStudents(trainerId);
        return { ...trainer, totalStudents: activeStudents };
    }
    /** Per-student summary cards for the dashboard student list. */
    async listStudents(trainerId) {
        const links = await trainerLinkRepository_js_1.trainerLinkRepository.listByTrainer(trainerId);
        const today = todayKey();
        const summaries = await Promise.all(links.map(async (link) => {
            const studentUid = link.studentUid;
            const [profile, latestWorkouts, nutrition, water] = await Promise.all([
                profileRepository_js_1.profileRepository.get(studentUid),
                workoutRepository_js_1.workoutRepository.list(studentUid, { status: 'completed', limit: 1 }),
                nutritionService_js_1.nutritionService.getDay(studentUid, today),
                waterService_js_1.waterService.getDay(studentUid, today),
            ]);
            const lastWorkout = latestWorkouts[0] ?? null;
            return {
                studentUid,
                name: profile?.name ?? null,
                photoUrl: profile?.photoUrl ?? null,
                goal: profile?.goals?.[0] ?? null,
                currentWeightKg: profile?.weightKg ?? null,
                lastWorkout: lastWorkout
                    ? {
                        id: lastWorkout.id,
                        name: lastWorkout.name,
                        startedAt: toIso(lastWorkout.startedAt),
                        totalVolume: lastWorkout.totalVolume ?? 0,
                    }
                    : null,
                todayActivity: {
                    caloriesConsumed: nutrition.totals?.calories ?? 0,
                    waterMl: water.totalMl ?? 0,
                    hasActivityToday: (nutrition.entries?.length ?? 0) > 0 || (water.totalMl ?? 0) > 0,
                },
                linkedAt: toIso(link.createdAt),
            };
        }));
        return summaries;
    }
    // --- Per-student detail views (authorization asserted by caller first) ---
    async studentOverview(studentUid) {
        const [profile, link] = await Promise.all([
            profileRepository_js_1.profileRepository.get(studentUid),
            trainerLinkRepository_js_1.trainerLinkRepository.get(studentUid),
        ]);
        return {
            studentUid,
            profile: profile ?? null,
            trainerAssociation: link
                ? { trainerId: link.trainerId, status: link.status, linkedAt: toIso(link.createdAt) }
                : null,
        };
    }
    /** The student's completed workouts for a given day. */
    async studentWorkoutsForDate(studentUid, dateKey) {
        const all = await workoutRepository_js_1.workoutRepository.list(studentUid, { status: 'completed' });
        return all.filter((w) => toDateKey(w.startedAt) === dateKey);
    }
    async studentWorkoutHistory(studentUid, limit = 100) {
        return progressService_js_1.progressService.history(studentUid, 'all', limit);
    }
    async studentNutrition(studentUid, dateKey) {
        return nutritionService_js_1.nutritionService.getDay(studentUid, dateKey);
    }
    async studentWater(studentUid, dateKey) {
        return waterService_js_1.waterService.getDay(studentUid, dateKey);
    }
    async studentProgress(studentUid, range = '90d') {
        return progressService_js_1.progressService.workoutSummary(studentUid, range);
    }
    /**
     * Progress photos, gated by the student's shareProgressWithTrainer flag.
     * When sharing is off, returns an empty list. Photos are returned with
     * short-lived signed URLs (never public).
     */
    async studentPhotos(studentUid) {
        const profile = await profileRepository_js_1.profileRepository.get(studentUid);
        const shared = profile?.shareProgressWithTrainer === true;
        if (!shared)
            return { shared: false, photos: [] };
        const photos = await progressPhotoService_js_1.progressPhotoService.listWithSignedUrls(studentUid);
        return { shared: true, photos };
    }
    /** Convenience: assert ownership then run a loader. */
    async forOwnedStudent(trainerId, studentUid, loader) {
        await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
        return loader();
    }
}
exports.TrainerService = TrainerService;
function todayKey() {
    return toDateKeyFromDate(new Date());
}
function toDateKeyFromDate(d) {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function toDateKey(value) {
    const t = value;
    if (t && typeof t.toDate === 'function')
        return toDateKeyFromDate(t.toDate());
    return null;
}
function toIso(value) {
    const t = value;
    if (t && typeof t.toDate === 'function')
        return t.toDate().toISOString();
    if (typeof value === 'string')
        return value;
    return null;
}
exports.trainerService = new TrainerService();
//# sourceMappingURL=trainerService.js.map
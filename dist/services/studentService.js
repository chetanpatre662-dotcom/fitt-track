"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentService = exports.StudentService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const trainerLinkRepository_js_1 = require("../repositories/trainerLinkRepository.js");
const trainerRepository_js_1 = require("../repositories/trainerRepository.js");
const profileRepository_js_1 = require("../repositories/profileRepository.js");
/**
 * Student-side view of the trainer relationship: the "My Trainer" card and the
 * progress-sharing toggle. Only exposes the trainer's public-facing fields
 * (name, photo, referral code, status) — never other students' data.
 */
class StudentService {
    /**
     * Returns the student's trainer, or {trainer:null} when there is no active
     * link (unlinked, or a non-active link).
     */
    async getTrainer(studentUid) {
        const link = await trainerLinkRepository_js_1.trainerLinkRepository.get(studentUid);
        if (!link || link.status !== 'active')
            return { trainer: null };
        const trainer = await trainerRepository_js_1.trainerRepository.get(link.trainerId);
        if (!trainer)
            return { trainer: null };
        return {
            trainer: {
                trainerId: trainer.trainerId ?? trainer.id,
                name: trainer.name ?? null,
                photoUrl: trainer.photoUrl ?? null,
                referralCode: trainer.referralCode ?? null,
                status: trainer.status ?? 'active',
                associationStatus: link.status,
            },
        };
    }
    /** Updates the student's progress-sharing flag on their profile. */
    async setSharing(studentUid, share) {
        await profileRepository_js_1.profileRepository.upsert(studentUid, {
            shareProgressWithTrainer: share,
            updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        });
        return { shareProgressWithTrainer: share };
    }
}
exports.StudentService = StudentService;
exports.studentService = new StudentService();
//# sourceMappingURL=studentService.js.map
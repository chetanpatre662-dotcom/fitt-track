"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trainerRepository = exports.TrainerRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Data access for the top-level trainers/{trainerId} profile document and the
 * referralCodes/{codeLower} lookup collection.
 *
 * Both collections are backend-Admin-SDK-write-only and never client-readable
 * (enforced by firestore.rules); all access goes through the Admin SDK here.
 */
class TrainerRepository {
    get trainersCol() {
        return (0, firebase_js_1.getFirestore)().collection('trainers');
    }
    get referralCodesCol() {
        return (0, firebase_js_1.getFirestore)().collection('referralCodes');
    }
    /** Returns trainers/{trainerId} or null. */
    async get(trainerId) {
        const snap = await this.trainersCol.doc(trainerId).get();
        if (!snap.exists)
            return null;
        return { id: snap.id, ...snap.data() };
    }
    /** Idempotently upserts trainers/{trainerId} (merge). */
    async upsert(trainerId, data) {
        await this.trainersCol.doc(trainerId).set(data, { merge: true });
    }
    /**
     * Looks up a referral code (expects an already-normalized, lowercased code)
     * and returns the owning trainerId, or null when the code is unknown.
     */
    async findTrainerIdByReferralCode(codeLower) {
        const snap = await this.referralCodesCol.doc(codeLower).get();
        if (!snap.exists)
            return null;
        const trainerId = snap.data()?.trainerId;
        return typeof trainerId === 'string' ? trainerId : null;
    }
    /** Idempotently upserts referralCodes/{codeLower} -> { trainerId }. */
    async setReferralCode(codeLower, trainerId) {
        await this.referralCodesCol.doc(codeLower).set({ trainerId }, { merge: true });
    }
    /**
     * Authoritative live count of a trainer's active students, computed from
     * trainerLinks rather than the stored counter so the dashboard total never
     * drifts.
     */
    async countActiveStudents(trainerId) {
        const snap = await (0, firebase_js_1.getFirestore)()
            .collection('trainerLinks')
            .where('trainerId', '==', trainerId)
            .where('status', '==', 'active')
            .get();
        return snap.size;
    }
    /** FieldValue increment helper for the stored totalStudents counter. */
    incrementTotalStudents(trainerId, by) {
        return this.trainersCol.doc(trainerId).set({
            totalStudents: firebase_js_1.admin.firestore.FieldValue.increment(by),
            updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
}
exports.TrainerRepository = TrainerRepository;
exports.trainerRepository = new TrainerRepository();
//# sourceMappingURL=trainerRepository.js.map
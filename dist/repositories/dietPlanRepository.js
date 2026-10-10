"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dietPlanRepository = exports.DietPlanRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Data access for dietPlans/{studentUid}: the single trainer-assigned diet plan
 * for a student (one plan per student, replaced on each assignment). Keyed by
 * the student's uid so a student's plan is reachable by exactly one document.
 *
 * Backend-Admin-SDK-only and never client-readable/writable (firestore.rules
 * denies all client access — mirrors the trainerLinks guard).
 */
class DietPlanRepository {
    get col() {
        return (0, firebase_js_1.getFirestore)().collection('dietPlans');
    }
    /** Returns dietPlans/{studentUid} or null. */
    async get(studentUid) {
        const snap = await this.col.doc(studentUid).get();
        if (!snap.exists)
            return null;
        return { studentUid: snap.id, ...snap.data() };
    }
    /**
     * Upserts dietPlans/{studentUid} (merge). The caller is responsible for
     * supplying the full logical plan — a diet plan is replaced in whole on each
     * assignment, so prior fields the caller omits (e.g. a removed image) must be
     * explicitly cleared by the caller.
     */
    async upsert(studentUid, data) {
        const ref = this.col.doc(studentUid);
        await ref.set({ ...data, updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const snap = await ref.get();
        return { studentUid: snap.id, ...snap.data() };
    }
}
exports.DietPlanRepository = DietPlanRepository;
exports.dietPlanRepository = new DietPlanRepository();
//# sourceMappingURL=dietPlanRepository.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyPlanRepository = exports.DailyPlanRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * The SINGLE source of truth for a user's structured workout plan for a given
 * day: users/{uid}/dailyPlans/{dateKey}.
 *
 * Both the Plans screen and the AI Chat read/write this one document, so they
 * can never disagree about "today's workout".
 */
class DailyPlanRepository {
    col(uid) {
        return (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('dailyPlans');
    }
    async get(uid, dateKey) {
        const snap = await this.col(uid).doc(dateKey).get();
        if (!snap.exists)
            return null;
        return { id: snap.id, ...snap.data() };
    }
    /** Creates or replaces the plan for a date, stamping created/updated times. */
    async set(uid, dateKey, data) {
        const ref = this.col(uid).doc(dateKey);
        const existing = await ref.get();
        const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
        await ref.set({
            ...data,
            dateKey,
            ...(existing.exists ? {} : { createdAt: now }),
            updatedAt: now,
        }, { merge: true });
        const snap = await ref.get();
        return { id: snap.id, ...snap.data() };
    }
}
exports.DailyPlanRepository = DailyPlanRepository;
exports.dailyPlanRepository = new DailyPlanRepository();
//# sourceMappingURL=dailyPlanRepository.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workoutRepository = exports.WorkoutRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Data access for users/{uid}/workouts/{workoutId}.
 *
 * Design note: a workout's exercises and sets are bounded in size and are
 * always read/written together, so they are stored as an embedded array on the
 * workout document rather than as subcollections. This makes reads a single
 * document fetch, updates atomic, and avoids many small Firestore operations —
 * a better engineering trade-off for workout-sized data than the subcollection
 * layout, while the documented subcollection paths remain reserved for future
 * per-set querying if ever needed.
 */
class WorkoutRepository {
    col(uid) {
        return (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('workouts');
    }
    newId(uid) {
        return this.col(uid).doc().id;
    }
    async get(uid, id) {
        const snap = await this.col(uid).doc(id).get();
        if (!snap.exists)
            return null;
        return { id: snap.id, ...snap.data() };
    }
    async list(uid, opts) {
        let q = this.col(uid);
        if (opts.isTemplate !== undefined)
            q = q.where('isTemplate', '==', opts.isTemplate);
        if (opts.status)
            q = q.where('status', '==', opts.status);
        // Templates ordered by update time; workouts by start/creation time.
        q = q.orderBy(opts.isTemplate ? 'updatedAt' : 'createdAt', 'desc');
        if (opts.limit)
            q = q.limit(opts.limit);
        const snap = await q.get();
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    async set(uid, id, data) {
        const ref = this.col(uid).doc(id);
        await ref.set({ ...data, updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const snap = await ref.get();
        return { id: snap.id, ...snap.data() };
    }
    async delete(uid, id) {
        await this.col(uid).doc(id).delete();
    }
}
exports.WorkoutRepository = WorkoutRepository;
exports.workoutRepository = new WorkoutRepository();
//# sourceMappingURL=workoutRepository.js.map
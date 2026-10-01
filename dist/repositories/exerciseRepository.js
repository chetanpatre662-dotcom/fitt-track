"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exerciseRepository = exports.ExerciseRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Data access for the global `exercises` collection. Reads come from Firestore
 * when configured; the service layer falls back to the bundled seed when
 * Firebase is unavailable so the library is usable offline / pre-configuration.
 */
class ExerciseRepository {
    get col() {
        return (0, firebase_js_1.getFirestore)().collection('exercises');
    }
    async getAll() {
        const snap = await this.col.get();
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    async getById(id) {
        const snap = await this.col.doc(id).get();
        if (!snap.exists)
            return null;
        return { id: snap.id, ...snap.data() };
    }
    /** Bulk upsert used by the seed script. */
    async upsertMany(exercises) {
        const db = (0, firebase_js_1.getFirestore)();
        const batchSize = 400;
        let written = 0;
        for (let i = 0; i < exercises.length; i += batchSize) {
            const batch = db.batch();
            for (const e of exercises.slice(i, i + batchSize)) {
                batch.set(this.col.doc(e.id), e, { merge: true });
            }
            await batch.commit();
            written += Math.min(batchSize, exercises.length - i);
        }
        return written;
    }
}
exports.ExerciseRepository = ExerciseRepository;
exports.exerciseRepository = new ExerciseRepository();
//# sourceMappingURL=exerciseRepository.js.map
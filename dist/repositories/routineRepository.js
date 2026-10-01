"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routineRepository = exports.RoutineRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Data access for:
 *  - users/{uid}/routines/{id}
 *  - users/{uid}/routineCompletions/{dateKey__routineId}
 */
class RoutineRepository {
    routines(uid) {
        return (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('routines');
    }
    completions(uid) {
        return (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('routineCompletions');
    }
    newId(uid) {
        return this.routines(uid).doc().id;
    }
    async get(uid, id) {
        const snap = await this.routines(uid).doc(id).get();
        if (!snap.exists)
            return null;
        return { id: snap.id, ...snap.data() };
    }
    async list(uid) {
        const snap = await this.routines(uid).get();
        const rows = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
        }));
        // Sort by time (HH:mm) ascending in-memory.
        rows.sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')));
        return rows;
    }
    async set(uid, id, data) {
        const ref = this.routines(uid).doc(id);
        await ref.set({ ...data, updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const snap = await ref.get();
        return { id: snap.id, ...snap.data() };
    }
    async delete(uid, id) {
        await this.routines(uid).doc(id).delete();
    }
    // --- Completions ---
    completionId(dateKey, routineId) {
        return `${dateKey}__${routineId}`;
    }
    async setCompletion(uid, dateKey, routineId, status) {
        const id = this.completionId(dateKey, routineId);
        const ref = this.completions(uid).doc(id);
        await ref.set({ dateKey, routineId, status, updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const snap = await ref.get();
        return { id: snap.id, ...snap.data() };
    }
    async listCompletionsByDate(uid, dateKey) {
        const snap = await this.completions(uid).where('dateKey', '==', dateKey).get();
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    /** Removes all completion docs for a routine (used when the routine is deleted). */
    async deleteCompletionsForRoutine(uid, routineId) {
        const snap = await this.completions(uid).where('routineId', '==', routineId).get();
        if (snap.empty)
            return;
        const batch = (0, firebase_js_1.getFirestore)().batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
    }
}
exports.RoutineRepository = RoutineRepository;
exports.routineRepository = new RoutineRepository();
//# sourceMappingURL=routineRepository.js.map
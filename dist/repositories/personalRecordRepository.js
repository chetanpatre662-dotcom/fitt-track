"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.personalRecordRepository = exports.PersonalRecordRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Data access for users/{uid}/personalRecords/{recordId}.
 * One document per (exerciseId, recordType) holding the current best.
 */
class PersonalRecordRepository {
    col(uid) {
        return (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('personalRecords');
    }
    docId(exerciseId, recordType) {
        return `${exerciseId}__${recordType}`;
    }
    async getBest(uid, exerciseId, recordType) {
        const snap = await this.col(uid).doc(this.docId(exerciseId, recordType)).get();
        if (!snap.exists)
            return null;
        return { id: snap.id, ...snap.data() };
    }
    async upsertBest(uid, record) {
        const id = this.docId(record.exerciseId, record.recordType);
        await this.col(uid).doc(id).set({ ...record, achievedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    async listForExercise(uid, exerciseId) {
        const snap = await this.col(uid).where('exerciseId', '==', exerciseId).get();
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    async listAll(uid) {
        const snap = await this.col(uid).orderBy('achievedAt', 'desc').get();
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
}
exports.PersonalRecordRepository = PersonalRecordRepository;
exports.personalRecordRepository = new PersonalRecordRepository();
//# sourceMappingURL=personalRecordRepository.js.map
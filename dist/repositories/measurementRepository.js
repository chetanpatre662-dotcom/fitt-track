"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.measurementRepository = exports.MeasurementRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Data access for users/{uid}/bodyMeasurements/{id}.
 *
 * Each document is an immutable dated record (height/weight at a point in
 * time). Editing the profile's current height/weight APPENDS a new record here
 * rather than mutating existing ones, so history is preserved. A composite
 * index (type ASC, measuredAt DESC) is declared in firestore.indexes.json.
 */
class MeasurementRepository {
    col(uid) {
        return (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('bodyMeasurements');
    }
    newId(uid) {
        return this.col(uid).doc().id;
    }
    /** Appends a measurement record. Never overwrites existing records. */
    async add(uid, id, data) {
        const ref = this.col(uid).doc(id);
        await ref.set({ ...data, createdAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() });
        const snap = await ref.get();
        return { id: snap.id, ...snap.data() };
    }
    /** Returns all measurement records, newest first (sorted in-memory). */
    async list(uid, limit = 365) {
        const snap = await this.col(uid).get();
        const rows = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
        }));
        rows.sort((a, b) => tsMillis(b.measuredAt) - tsMillis(a.measuredAt));
        return rows.slice(0, limit);
    }
}
exports.MeasurementRepository = MeasurementRepository;
function tsMillis(value) {
    const t = value;
    if (t && typeof t.toMillis === 'function')
        return t.toMillis();
    if (typeof value === 'string') {
        const ms = Date.parse(value);
        return Number.isNaN(ms) ? 0 : ms;
    }
    return 0;
}
exports.measurementRepository = new MeasurementRepository();
//# sourceMappingURL=measurementRepository.js.map
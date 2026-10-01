"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waterRepository = exports.WaterRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/** Data access for users/{uid}/waterLogs/{id}. */
class WaterRepository {
    col(uid) {
        return (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('waterLogs');
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
    async listByDate(uid, dateKey) {
        const snap = await this.col(uid).where('dateKey', '==', dateKey).get();
        const rows = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
        }));
        rows.sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
        return rows;
    }
    async add(uid, data) {
        const id = this.newId(uid);
        const ref = this.col(uid).doc(id);
        await ref.set({ ...data, createdAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() });
        const snap = await ref.get();
        return { id: snap.id, ...snap.data() };
    }
    async delete(uid, id) {
        await this.col(uid).doc(id).delete();
    }
}
exports.WaterRepository = WaterRepository;
function tsMillis(value) {
    const t = value;
    return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
}
exports.waterRepository = new WaterRepository();
//# sourceMappingURL=waterRepository.js.map
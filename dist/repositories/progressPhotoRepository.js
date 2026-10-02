"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.progressPhotoRepository = exports.ProgressPhotoRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Metadata for progress photos: users/{uid}/progressPhotos/{id}.
 *
 * The image bytes live in Firebase Storage (uploaded by the authenticated
 * client under users/{uid}/..., enforced private by Storage rules). Only the
 * storage path + descriptive metadata are stored here, matching the app's
 * existing "metadata in Firestore, binary in Storage" split.
 */
class ProgressPhotoRepository {
    col(uid) {
        return (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('progressPhotos');
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
    async set(uid, id, data) {
        const ref = this.col(uid).doc(id);
        await ref.set({ ...data, updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const snap = await ref.get();
        return { id: snap.id, ...snap.data() };
    }
    async list(uid, limit = 200) {
        const snap = await this.col(uid).get();
        const rows = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
        }));
        rows.sort((a, b) => tsMillis(b.takenAt) - tsMillis(a.takenAt));
        return rows.slice(0, limit);
    }
    async delete(uid, id) {
        await this.col(uid).doc(id).delete();
    }
}
exports.ProgressPhotoRepository = ProgressPhotoRepository;
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
exports.progressPhotoRepository = new ProgressPhotoRepository();
//# sourceMappingURL=progressPhotoRepository.js.map
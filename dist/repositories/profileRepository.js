"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileRepository = exports.ProfileRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Data access for the single profile document at users/{uid}/profile/data.
 */
class ProfileRepository {
    doc(uid) {
        return (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('profile').doc('data');
    }
    async get(uid) {
        const snap = await this.doc(uid).get();
        return snap.exists ? snap.data() : null;
    }
    /** Upserts the profile document (merge) and stamps updatedAt. */
    async upsert(uid, data) {
        const ref = this.doc(uid);
        const payload = { ...data, updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() };
        await ref.set(payload, { merge: true });
        const snap = await ref.get();
        return snap.data();
    }
}
exports.ProfileRepository = ProfileRepository;
exports.profileRepository = new ProfileRepository();
//# sourceMappingURL=profileRepository.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRepository = exports.UserRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Data access for the top-level users/{uid} account document.
 */
class UserRepository {
    get col() {
        return (0, firebase_js_1.getFirestore)().collection('users');
    }
    doc(uid) {
        return this.col.doc(uid);
    }
    /**
     * Ensures a users/{uid} document exists. Creates it on first sign-in with
     * sensible defaults, otherwise returns the existing account. Returns the
     * account plus whether it was newly created.
     */
    async ensureAccount(params) {
        const ref = this.doc(params.uid);
        const snap = await ref.get();
        if (!snap.exists) {
            const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
            const data = {
                uid: params.uid,
                email: params.email,
                emailVerified: params.emailVerified,
                displayName: params.displayName,
                units: 'metric',
                onboardingCompleted: false,
                fcmTokens: [],
                createdAt: now,
                updatedAt: now,
            };
            await ref.set(data);
            return { account: { ...data, createdAt: null, updatedAt: null }, created: true };
        }
        // Keep email/verification status fresh on each verify call.
        const patch = {
            email: params.email,
            emailVerified: params.emailVerified,
            updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        };
        await ref.set(patch, { merge: true });
        return { account: { ...snap.data(), ...patch }, created: false };
    }
    /** Adds an FCM token to the account (idempotent via arrayUnion). */
    async addFcmToken(uid, token) {
        await this.doc(uid).set({
            fcmTokens: firebase_js_1.admin.firestore.FieldValue.arrayUnion(token),
            updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    /** Removes an FCM token from the account. */
    async removeFcmToken(uid, token) {
        await this.doc(uid).set({
            fcmTokens: firebase_js_1.admin.firestore.FieldValue.arrayRemove(token),
            updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    /**
     * Recursively deletes all data under users/{uid} and the account doc itself.
     * Uses the Admin SDK recursiveDelete which handles subcollections.
     */
    async deleteAllUserData(uid) {
        const firestore = (0, firebase_js_1.getFirestore)();
        await firestore.recursiveDelete(this.doc(uid));
    }
}
exports.UserRepository = UserRepository;
exports.userRepository = new UserRepository();
//# sourceMappingURL=userRepository.js.map
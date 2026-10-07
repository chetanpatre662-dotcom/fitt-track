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
        // Only touch the doc when a tracked field actually changed, so an
        // unchanged reopen/login produces no Firestore write (and never rewrites
        // createdAt). email/emailVerified are the only fields verify can refresh.
        const existing = snap.data() ?? {};
        const emailChanged = existing.email !== params.email;
        const verifiedChanged = existing.emailVerified !== params.emailVerified;
        if (!emailChanged && !verifiedChanged) {
            return { account: existing, created: false };
        }
        const patch = {
            email: params.email,
            emailVerified: params.emailVerified,
            updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        };
        await ref.set(patch, { merge: true });
        return { account: { ...existing, ...patch }, created: false };
    }
    /**
     * Returns the stored role for the account, or null when no role field is
     * present (legacy accounts). Never writes — role is resolved by RoleService.
     */
    async getRole(uid) {
        const snap = await this.doc(uid).get();
        if (!snap.exists)
            return null;
        const role = snap.data()?.role;
        return typeof role === 'string' ? role : null;
    }
    /**
     * Adds an FCM token to the account. No-op when the token is already stored,
     * so a reopen/login that re-registers the same token writes nothing.
     */
    async addFcmToken(uid, token) {
        const ref = this.doc(uid);
        const snap = await ref.get();
        const existing = snap.data()?.fcmTokens ?? [];
        if (existing.includes(token))
            return;
        await ref.set({
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
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.AuthService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const userRepository_js_1 = require("../repositories/userRepository.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Auth-related business logic that requires the Admin SDK.
 */
class AuthService {
    /**
     * Called after the client signs in. Ensures the account document exists and
     * returns account metadata. UID/email are taken from the verified token by
     * the caller, never from the request body.
     */
    async verifyAndSync(params) {
        const { account } = await userRepository_js_1.userRepository.ensureAccount(params);
        return account;
    }
    /**
     * Fully deletes a user: Firestore data, their Storage folder, and the
     * Firebase Auth account. Ordered so that if auth deletion fails, data is
     * already gone and can be retried; the auth account removal is last.
     */
    async deleteAccount(uid) {
        // 1. Firestore data (recursive).
        await userRepository_js_1.userRepository.deleteAllUserData(uid);
        // 2. Storage files under users/{uid}/.
        try {
            await (0, firebase_js_1.getBucket)().deleteFiles({ prefix: `users/${uid}/` });
        }
        catch (err) {
            // Non-fatal: bucket may not exist in some environments. Log and continue.
            logger_js_1.logger.warn({ err, uid }, 'Failed to delete user storage files (continuing)');
        }
        // 3. Firebase Auth account.
        await (0, firebase_js_1.getAuth)().deleteUser(uid);
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
//# sourceMappingURL=authService.js.map
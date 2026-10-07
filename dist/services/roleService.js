"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleService = exports.RoleService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const userRepository_js_1 = require("../repositories/userRepository.js");
/**
 * Resolves the server-trusted role for a uid. The role is computed, never read
 * from the client:
 *   1. If users/{uid}.role is set, use it.
 *   2. Otherwise, if a trainers/{uid} doc exists, the account is a 'trainer'.
 *   3. Otherwise the account is a normal 'student' (default for legacy accounts
 *      that predate the role field).
 *
 * This never writes the role back — it is purely derived so a legacy account
 * stays untouched until something explicitly sets its role (e.g. the trainer
 * seed script).
 */
class RoleService {
    async resolveRole(uid) {
        const stored = await userRepository_js_1.userRepository.getRole(uid);
        if (stored === 'trainer' || stored === 'student')
            return stored;
        const trainerSnap = await (0, firebase_js_1.getFirestore)().collection('trainers').doc(uid).get();
        return trainerSnap.exists ? 'trainer' : 'student';
    }
}
exports.RoleService = RoleService;
exports.roleService = new RoleService();
//# sourceMappingURL=roleService.js.map
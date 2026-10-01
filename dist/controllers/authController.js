"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verify = verify;
exports.deleteAccount = deleteAccount;
const auth_js_1 = require("../middleware/auth.js");
const authService_js_1 = require("../services/authService.js");
const http_js_1 = require("../utils/http.js");
/**
 * POST /api/auth/verify
 * Confirms the caller's token (already verified by middleware), ensures the
 * account doc exists, and returns account metadata used to drive routing
 * (e.g. onboardingCompleted).
 */
async function verify(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const account = await authService_js_1.authService.verifyAndSync({
        uid,
        email: req.auth?.email ?? null,
        emailVerified: req.auth?.email_verified ?? false,
        displayName: req.auth?.name ?? null,
    });
    (0, http_js_1.ok)(res, { account });
}
/**
 * DELETE /api/auth/account
 * Permanently deletes the authenticated user's data and auth account.
 */
async function deleteAccount(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    await authService_js_1.authService.deleteAccount(uid);
    (0, http_js_1.ok)(res, { deleted: true });
}
//# sourceMappingURL=authController.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verify = verify;
exports.linkTrainer = linkTrainer;
exports.registerTrainer = registerTrainer;
exports.deleteAccount = deleteAccount;
const auth_js_1 = require("../middleware/auth.js");
const authService_js_1 = require("../services/authService.js");
const trainerService_js_1 = require("../services/trainerService.js");
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
 * POST /api/auth/link-trainer
 * Sends a connect REQUEST from the authenticated student to a trainer by
 * referral code. The code is validated on the backend; an unknown code is a
 * soft success (no request) so a typo never blocks registration. A valid code
 * creates a PENDING request awaiting the trainer's approval — it does NOT grant
 * access or link immediately.
 */
async function linkTrainer(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { referralCode } = req.body;
    const result = await trainerService_js_1.trainerService.requestTrainer(uid, referralCode);
    (0, http_js_1.ok)(res, result);
}
/**
 * POST /api/auth/register-trainer
 * Promotes the authenticated (just-created) Firebase user to a trainer: sets
 * the role server-side, creates the trainer record, and assigns a generated
 * unique referral code. Idempotent — a re-call never creates a duplicate
 * trainer or a second code. The role is NEVER taken from the client.
 */
async function registerTrainer(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { name } = req.body;
    const result = await trainerService_js_1.trainerService.ensureTrainerAccount(uid, {
        name,
        email: req.auth?.email ?? null,
        photoUrl: req.auth?.picture ?? null,
    });
    (0, http_js_1.ok)(res, result);
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
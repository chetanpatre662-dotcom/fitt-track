"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireTrainer = void 0;
exports.assertTrainerOwnsStudent = assertTrainerOwnsStudent;
exports.assertTrainerOwnsPendingRequest = assertTrainerOwnsPendingRequest;
const auth_js_1 = require("./auth.js");
const roleService_js_1 = require("../services/roleService.js");
const trainerLinkRepository_js_1 = require("../repositories/trainerLinkRepository.js");
const errors_js_1 = require("../utils/errors.js");
const http_js_1 = require("../utils/http.js");
/**
 * Guard that requires the authenticated caller to be a trainer. Must run AFTER
 * `authenticate`. The role is resolved server-side (never from the client);
 * non-trainers get a 403.
 */
exports.requireTrainer = (0, http_js_1.asyncHandler)(async (req, _res, next) => {
    const uid = (0, auth_js_1.requireUid)(req);
    const role = await roleService_js_1.roleService.resolveRole(uid);
    if (role !== 'trainer') {
        throw new errors_js_1.ForbiddenError('Trainer access required.');
    }
    next();
});
/**
 * Asserts that `trainerId` owns an ACTIVE link to `studentUid`. Any failure —
 * missing link, a different trainer's student, or an inactive link — throws a
 * 404 (NOT 403) so a trainer cannot even distinguish "not yours" from
 * "doesn't exist", preventing cross-trainer student enumeration.
 */
async function assertTrainerOwnsStudent(trainerId, studentUid) {
    const link = await trainerLinkRepository_js_1.trainerLinkRepository.get(studentUid);
    if (!link || link.trainerId !== trainerId || link.status !== 'active') {
        throw new errors_js_1.NotFoundError('Student not found');
    }
}
/**
 * Asserts that `trainerId` owns a PENDING request from `studentUid` (used only
 * by approve/reject). Any failure — missing link, a different trainer's
 * request, or a link that is not pending — throws a 404 (NOT 403) for the same
 * anti-enumeration reason as `assertTrainerOwnsStudent`. Deliberately does NOT
 * grant any per-student data access; it only authorizes acting on the request.
 */
async function assertTrainerOwnsPendingRequest(trainerId, studentUid) {
    const link = await trainerLinkRepository_js_1.trainerLinkRepository.get(studentUid);
    if (!link || link.trainerId !== trainerId || link.status !== 'pending') {
        throw new errors_js_1.NotFoundError('Request not found');
    }
}
//# sourceMappingURL=role.js.map
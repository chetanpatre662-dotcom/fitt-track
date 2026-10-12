"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrainer = getTrainer;
exports.leaveTrainer = leaveTrainer;
exports.connectTrainer = connectTrainer;
exports.setSharing = setSharing;
exports.getDietPlan = getDietPlan;
exports.getAssignedWorkouts = getAssignedWorkouts;
const auth_js_1 = require("../middleware/auth.js");
const studentService_js_1 = require("../services/studentService.js");
const trainerService_js_1 = require("../services/trainerService.js");
const dietPlanAssignmentService_js_1 = require("../services/dietPlanAssignmentService.js");
const assignedWorkoutService_js_1 = require("../services/assignedWorkoutService.js");
const http_js_1 = require("../utils/http.js");
const errors_js_1 = require("../utils/errors.js");
const trainerValidators_js_1 = require("../validators/trainerValidators.js");
/** GET /api/student/trainer — the student's "My Trainer" card ({trainer:null} when unlinked). */
async function getTrainer(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const result = await studentService_js_1.studentService.getTrainer(uid);
    (0, http_js_1.ok)(res, result);
}
/**
 * DELETE /api/student/trainer — the student-initiated "Leave Trainer" / "Cancel
 * request" action. Keyed by the authenticated uid only (no body, no validator);
 * returns HTTP 200 { ok:true, previousStatus, status:'inactive' } for every
 * branch so the client derives its confirmation copy from previousStatus.
 */
async function leaveTrainer(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const result = await studentService_js_1.studentService.leaveTrainer(uid);
    (0, http_js_1.ok)(res, result);
}
/**
 * POST /api/student/connect-trainer — connect-after-registration from Profile.
 * A thin alias delegating to the same requestTrainer service as
 * /auth/link-trainer (identical body/semantics) so behavior cannot drift. A
 * valid code now creates a PENDING request (awaiting trainer approval), not an
 * active link; an unknown code stays a soft {ok:false, reason:'invalid_code'}.
 */
async function connectTrainer(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { referralCode } = req.body;
    const result = await trainerService_js_1.trainerService.requestTrainer(uid, referralCode);
    (0, http_js_1.ok)(res, result);
}
/**
 * PATCH /api/student/trainer/sharing — update the student's granular progress-
 * sharing preferences. Precedence (the validator already guaranteed a non-empty
 * body with no unknown keys):
 *   - granular keys only  -> apply them directly;
 *   - legacy boolean only -> map to {progressPhotos: value} (backward compat);
 *   - BOTH present        -> 400 (a client must pick one shape).
 * Returns the fully-resolved five-key sharing map.
 */
async function setSharing(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const body = req.body;
    const { shareProgressWithTrainer, ...rest } = body;
    const granular = {};
    for (const category of trainerValidators_js_1.SHARING_CATEGORIES) {
        const value = rest[category];
        if (typeof value === 'boolean')
            granular[category] = value;
    }
    const hasGranular = Object.keys(granular).length > 0;
    const hasLegacy = typeof shareProgressWithTrainer === 'boolean';
    if (hasGranular && hasLegacy) {
        throw new errors_js_1.BadRequestError('Send either shareProgressWithTrainer or granular sharing categories, not both.');
    }
    const patch = hasLegacy
        ? { progressPhotos: shareProgressWithTrainer }
        : granular;
    const result = await studentService_js_1.studentService.setSharing(uid, patch);
    (0, http_js_1.ok)(res, result);
}
/**
 * GET /api/student/diet-plan — the student's current trainer-assigned diet
 * plan, or {dietPlan:null} when there is none / the plan was assigned by a
 * trainer the student is no longer actively linked to. The image (if any) is
 * returned as a short-lived backend-signed `imageUrl`, never a direct path.
 */
async function getDietPlan(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const dietPlan = await dietPlanAssignmentService_js_1.dietPlanAssignmentService.getForStudent(uid);
    (0, http_js_1.ok)(res, { dietPlan });
}
/**
 * GET /api/student/assigned-workouts — the student's current trainer-assigned
 * workout schedules (empty when there is no active link, or filtered to the
 * current active trainer's items). The student's Start Workout prefills the
 * existing active-workout logger from these templates.
 */
async function getAssignedWorkouts(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const assignedWorkouts = await assignedWorkoutService_js_1.assignedWorkoutService.getForStudent(uid);
    (0, http_js_1.ok)(res, { assignedWorkouts });
}
//# sourceMappingURL=studentController.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfile = getProfile;
exports.listStudents = listStudents;
exports.studentOverview = studentOverview;
exports.studentWorkouts = studentWorkouts;
exports.studentWorkoutHistory = studentWorkoutHistory;
exports.studentNutrition = studentNutrition;
exports.studentWater = studentWater;
exports.studentProgress = studentProgress;
exports.studentPhotos = studentPhotos;
exports.studentMeasurements = studentMeasurements;
exports.studentExerciseProgression = studentExerciseProgression;
exports.studentRecords = studentRecords;
exports.assignDietPlan = assignDietPlan;
exports.studentDietPlan = studentDietPlan;
exports.assignWorkout = assignWorkout;
exports.listRequests = listRequests;
exports.approveRequest = approveRequest;
exports.rejectRequest = rejectRequest;
exports.getReferralCode = getReferralCode;
exports.generateReferralCode = generateReferralCode;
exports.setReferralCode = setReferralCode;
exports.checkReferralCodeAvailability = checkReferralCodeAvailability;
const auth_js_1 = require("../middleware/auth.js");
const role_js_1 = require("../middleware/role.js");
const trainerService_js_1 = require("../services/trainerService.js");
const dietPlanAssignmentService_js_1 = require("../services/dietPlanAssignmentService.js");
const assignedWorkoutService_js_1 = require("../services/assignedWorkoutService.js");
const http_js_1 = require("../utils/http.js");
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
        .getDate()
        .toString()
        .padStart(2, '0')}`;
}
async function getProfile(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const profile = await trainerService_js_1.trainerService.getProfile(trainerId);
    (0, http_js_1.ok)(res, { profile });
}
async function listStudents(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const students = await trainerService_js_1.trainerService.listStudents(trainerId);
    (0, http_js_1.ok)(res, { students });
}
async function studentOverview(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const overview = await trainerService_js_1.trainerService.studentOverview(studentUid);
    (0, http_js_1.ok)(res, { overview });
}
async function studentWorkouts(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const { date } = req.query;
    const result = await trainerService_js_1.trainerService.studentWorkoutsForDate(studentUid, date ?? todayKey());
    (0, http_js_1.ok)(res, result);
}
async function studentWorkoutHistory(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const { limit } = req.query;
    const result = await trainerService_js_1.trainerService.studentWorkoutHistory(studentUid, limit);
    (0, http_js_1.ok)(res, result);
}
async function studentNutrition(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const { date } = req.query;
    const nutrition = await trainerService_js_1.trainerService.studentNutrition(studentUid, date ?? todayKey());
    (0, http_js_1.ok)(res, nutrition);
}
async function studentWater(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const { date } = req.query;
    const water = await trainerService_js_1.trainerService.studentWater(studentUid, date ?? todayKey());
    (0, http_js_1.ok)(res, water);
}
async function studentProgress(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const result = await trainerService_js_1.trainerService.studentProgress(studentUid);
    (0, http_js_1.ok)(res, result);
}
async function studentPhotos(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const result = await trainerService_js_1.trainerService.studentPhotos(studentUid);
    (0, http_js_1.ok)(res, result);
}
/** GET /api/trainer/students/:studentUid/measurements — body-measurement history. */
async function studentMeasurements(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const result = await trainerService_js_1.trainerService.studentMeasurements(studentUid);
    (0, http_js_1.ok)(res, result);
}
/** GET /api/trainer/students/:studentUid/exercise — per-exercise progression. */
async function studentExerciseProgression(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const { exerciseId, range } = req.query;
    const result = await trainerService_js_1.trainerService.studentExerciseProgression(studentUid, exerciseId, range);
    (0, http_js_1.ok)(res, result);
}
/** GET /api/trainer/students/:studentUid/records — personal records. */
async function studentRecords(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const result = await trainerService_js_1.trainerService.studentRecords(studentUid);
    (0, http_js_1.ok)(res, result);
}
/**
 * POST /api/trainer/students/:studentUid/diet-plan — assign/replace the
 * student's diet plan (text and/or an uploaded image). Ownership (404) is
 * asserted before any write; the service enforces the storage-path guard.
 */
async function assignDietPlan(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const body = req.body;
    const dietPlan = await dietPlanAssignmentService_js_1.dietPlanAssignmentService.assignForStudent(trainerId, studentUid, body);
    (0, http_js_1.ok)(res, { dietPlan });
}
/**
 * GET /api/trainer/students/:studentUid/diet-plan — the diet plan the trainer
 * previously assigned to this student (text + short-lived signed image URL), or
 * { dietPlan: null } when none exists. Ownership (404) is asserted first.
 */
async function studentDietPlan(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const dietPlan = await dietPlanAssignmentService_js_1.dietPlanAssignmentService.getForTrainer(trainerId, studentUid);
    (0, http_js_1.ok)(res, { dietPlan });
}
/**
 * POST /api/trainer/students/:studentUid/workouts/assign — schedule a workout
 * for the student from a template of exercises. Ownership (404) is asserted
 * before any write; the body shape/limits are validated by assignWorkoutSchema.
 */
async function assignWorkout(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const body = req.body;
    const assignedWorkout = await assignedWorkoutService_js_1.assignedWorkoutService.assignForStudent(trainerId, studentUid, body);
    (0, http_js_1.ok)(res, { assignedWorkout });
}
/** GET /api/trainer/requests — pending connect requests (name + photo). */
async function listRequests(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const requests = await trainerService_js_1.trainerService.listRequestsForTrainer(trainerId);
    (0, http_js_1.ok)(res, { requests });
}
/** POST /api/trainer/requests/:studentUid/approve — approve a pending request. */
async function approveRequest(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    const result = await trainerService_js_1.trainerService.approveRequest(trainerId, studentUid);
    (0, http_js_1.ok)(res, { ok: true, studentUid, status: result.status });
}
/** POST /api/trainer/requests/:studentUid/reject — reject a pending request. */
async function rejectRequest(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    const result = await trainerService_js_1.trainerService.rejectRequest(trainerId, studentUid);
    (0, http_js_1.ok)(res, { ok: true, studentUid, status: result.status });
}
/** GET /api/trainer/referral-code — the trainer's current code. */
async function getReferralCode(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const referralCode = await trainerService_js_1.trainerService.getReferralCode(trainerId);
    (0, http_js_1.ok)(res, { referralCode });
}
/** POST /api/trainer/referral-code — generate a new unique code (regenerate). */
async function generateReferralCode(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const code = await trainerService_js_1.trainerService.generateReferralCode(trainerId);
    (0, http_js_1.ok)(res, { referralCode: { code, active: true } });
}
/** PATCH /api/trainer/referral-code — set a custom code. */
async function setReferralCode(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { code } = req.body;
    const saved = await trainerService_js_1.trainerService.setCustomReferralCode(trainerId, code);
    (0, http_js_1.ok)(res, { referralCode: { code: saved, active: true } });
}
/** GET /api/trainer/referral-code/availability?code= — availability check. */
async function checkReferralCodeAvailability(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { code } = req.query;
    const result = await trainerService_js_1.trainerService.checkAvailability(code, trainerId);
    (0, http_js_1.ok)(res, result);
}
//# sourceMappingURL=trainerController.js.map
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
const auth_js_1 = require("../middleware/auth.js");
const role_js_1 = require("../middleware/role.js");
const trainerService_js_1 = require("../services/trainerService.js");
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
    const workouts = await trainerService_js_1.trainerService.studentWorkoutsForDate(studentUid, date ?? todayKey());
    (0, http_js_1.ok)(res, { workouts });
}
async function studentWorkoutHistory(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const { limit } = req.query;
    const history = await trainerService_js_1.trainerService.studentWorkoutHistory(studentUid, limit);
    (0, http_js_1.ok)(res, { history });
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
    const progress = await trainerService_js_1.trainerService.studentProgress(studentUid);
    (0, http_js_1.ok)(res, { progress });
}
async function studentPhotos(req, res) {
    const trainerId = (0, auth_js_1.requireUid)(req);
    const { studentUid } = req.params;
    await (0, role_js_1.assertTrainerOwnsStudent)(trainerId, studentUid);
    const result = await trainerService_js_1.trainerService.studentPhotos(studentUid);
    (0, http_js_1.ok)(res, result);
}
//# sourceMappingURL=trainerController.js.map
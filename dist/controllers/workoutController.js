"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listWorkouts = listWorkouts;
exports.createWorkout = createWorkout;
exports.getWorkout = getWorkout;
exports.updateWorkout = updateWorkout;
exports.setWorkoutStatus = setWorkoutStatus;
exports.deleteWorkout = deleteWorkout;
exports.duplicateWorkout = duplicateWorkout;
const auth_js_1 = require("../middleware/auth.js");
const workoutService_js_1 = require("../services/workoutService.js");
const http_js_1 = require("../utils/http.js");
async function listWorkouts(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const q = req.query;
    const workouts = await workoutService_js_1.workoutService.list(uid, q);
    (0, http_js_1.ok)(res, { workouts });
}
async function createWorkout(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const workout = await workoutService_js_1.workoutService.create(uid, req.body);
    (0, http_js_1.ok)(res, { workout }, 201);
}
async function getWorkout(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const workout = await workoutService_js_1.workoutService.get(uid, req.params.id);
    (0, http_js_1.ok)(res, { workout });
}
async function updateWorkout(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const workout = await workoutService_js_1.workoutService.update(uid, req.params.id, req.body);
    (0, http_js_1.ok)(res, { workout });
}
async function setWorkoutStatus(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { status } = req.body;
    const workout = await workoutService_js_1.workoutService.transition(uid, req.params.id, status);
    (0, http_js_1.ok)(res, { workout });
}
async function deleteWorkout(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    await workoutService_js_1.workoutService.delete(uid, req.params.id);
    (0, http_js_1.ok)(res, { deleted: true });
}
async function duplicateWorkout(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const asTemplate = req.body?.asTemplate;
    const workout = await workoutService_js_1.workoutService.duplicate(uid, req.params.id, asTemplate);
    (0, http_js_1.ok)(res, { workout }, 201);
}
//# sourceMappingURL=workoutController.js.map
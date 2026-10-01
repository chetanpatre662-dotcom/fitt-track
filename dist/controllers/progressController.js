"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkoutProgress = getWorkoutProgress;
exports.getWorkoutHistory = getWorkoutHistory;
exports.getExerciseProgression = getExerciseProgression;
exports.getPersonalRecords = getPersonalRecords;
const auth_js_1 = require("../middleware/auth.js");
const progressService_js_1 = require("../services/progressService.js");
const personalRecordService_js_1 = require("../services/personalRecordService.js");
const http_js_1 = require("../utils/http.js");
async function getWorkoutProgress(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { range } = req.query;
    const summary = await progressService_js_1.progressService.workoutSummary(uid, range);
    (0, http_js_1.ok)(res, { progress: summary });
}
async function getWorkoutHistory(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { range, limit } = req.query;
    const history = await progressService_js_1.progressService.history(uid, range, limit);
    (0, http_js_1.ok)(res, { history });
}
async function getExerciseProgression(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { exerciseId, range } = req.query;
    const progression = await progressService_js_1.progressService.exerciseProgression(uid, exerciseId, range);
    (0, http_js_1.ok)(res, { progression });
}
async function getPersonalRecords(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const records = await personalRecordService_js_1.personalRecordService.listAll(uid);
    (0, http_js_1.ok)(res, { personalRecords: records });
}
//# sourceMappingURL=progressController.js.map
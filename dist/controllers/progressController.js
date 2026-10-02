"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkoutProgress = getWorkoutProgress;
exports.getWorkoutHistory = getWorkoutHistory;
exports.getExerciseProgression = getExerciseProgression;
exports.getPersonalRecords = getPersonalRecords;
exports.getMeasurements = getMeasurements;
exports.addMeasurement = addMeasurement;
exports.getProgressPhotos = getProgressPhotos;
exports.addProgressPhoto = addProgressPhoto;
exports.deleteProgressPhoto = deleteProgressPhoto;
const auth_js_1 = require("../middleware/auth.js");
const progressService_js_1 = require("../services/progressService.js");
const personalRecordService_js_1 = require("../services/personalRecordService.js");
const measurementService_js_1 = require("../services/measurementService.js");
const progressPhotoService_js_1 = require("../services/progressPhotoService.js");
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
async function getMeasurements(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const measurements = await measurementService_js_1.measurementService.list(uid);
    (0, http_js_1.ok)(res, { measurements });
}
async function addMeasurement(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const measurement = await measurementService_js_1.measurementService.add(uid, req.body);
    (0, http_js_1.ok)(res, { measurement }, 201);
}
async function getProgressPhotos(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const photos = await progressPhotoService_js_1.progressPhotoService.list(uid);
    (0, http_js_1.ok)(res, { photos });
}
async function addProgressPhoto(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const photo = await progressPhotoService_js_1.progressPhotoService.create(uid, req.body);
    (0, http_js_1.ok)(res, { photo }, 201);
}
async function deleteProgressPhoto(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    await progressPhotoService_js_1.progressPhotoService.delete(uid, req.params.id);
    (0, http_js_1.ok)(res, { deleted: true });
}
//# sourceMappingURL=progressController.js.map
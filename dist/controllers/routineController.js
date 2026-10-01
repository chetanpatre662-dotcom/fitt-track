"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listRoutines = listRoutines;
exports.getToday = getToday;
exports.createRoutine = createRoutine;
exports.updateRoutine = updateRoutine;
exports.deleteRoutine = deleteRoutine;
exports.completeRoutine = completeRoutine;
const auth_js_1 = require("../middleware/auth.js");
const routineService_js_1 = require("../services/routineService.js");
const http_js_1 = require("../utils/http.js");
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
        .getDate()
        .toString()
        .padStart(2, '0')}`;
}
async function listRoutines(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const routines = await routineService_js_1.routineService.list(uid);
    (0, http_js_1.ok)(res, { routines });
}
async function getToday(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { date } = req.query;
    const day = await routineService_js_1.routineService.getDay(uid, date ?? todayKey());
    (0, http_js_1.ok)(res, day);
}
async function createRoutine(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const routine = await routineService_js_1.routineService.create(uid, req.body);
    (0, http_js_1.ok)(res, { routine }, 201);
}
async function updateRoutine(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const routine = await routineService_js_1.routineService.update(uid, req.params.id, req.body);
    (0, http_js_1.ok)(res, { routine });
}
async function deleteRoutine(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    await routineService_js_1.routineService.delete(uid, req.params.id);
    (0, http_js_1.ok)(res, { deleted: true });
}
async function completeRoutine(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { dateKey, status } = req.body;
    const completion = await routineService_js_1.routineService.setCompletion(uid, req.params.id, dateKey, status);
    (0, http_js_1.ok)(res, { completion });
}
//# sourceMappingURL=routineController.js.map
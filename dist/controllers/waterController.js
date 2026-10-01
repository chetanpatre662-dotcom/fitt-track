"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getToday = getToday;
exports.addWater = addWater;
exports.deleteWater = deleteWater;
const auth_js_1 = require("../middleware/auth.js");
const waterService_js_1 = require("../services/waterService.js");
const http_js_1 = require("../utils/http.js");
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
        .getDate()
        .toString()
        .padStart(2, '0')}`;
}
async function getToday(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { date } = req.query;
    const day = await waterService_js_1.waterService.getDay(uid, date ?? todayKey());
    (0, http_js_1.ok)(res, day);
}
async function addWater(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const entry = await waterService_js_1.waterService.add(uid, req.body);
    (0, http_js_1.ok)(res, { entry }, 201);
}
async function deleteWater(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    await waterService_js_1.waterService.delete(uid, req.params.id);
    (0, http_js_1.ok)(res, { deleted: true });
}
//# sourceMappingURL=waterController.js.map
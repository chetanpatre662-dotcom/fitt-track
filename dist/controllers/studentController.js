"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrainer = getTrainer;
exports.setSharing = setSharing;
const auth_js_1 = require("../middleware/auth.js");
const studentService_js_1 = require("../services/studentService.js");
const http_js_1 = require("../utils/http.js");
/** GET /api/student/trainer — the student's "My Trainer" card ({trainer:null} when unlinked). */
async function getTrainer(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const result = await studentService_js_1.studentService.getTrainer(uid);
    (0, http_js_1.ok)(res, result);
}
/** PATCH /api/student/trainer/sharing — toggle progress sharing with the trainer. */
async function setSharing(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { shareProgressWithTrainer } = req.body;
    const result = await studentService_js_1.studentService.setSharing(uid, shareProgressWithTrainer);
    (0, http_js_1.ok)(res, result);
}
//# sourceMappingURL=studentController.js.map
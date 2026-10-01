"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordResult = recordResult;
exports.getSummary = getSummary;
const auth_js_1 = require("../middleware/auth.js");
const gameService_js_1 = require("../services/gameService.js");
const http_js_1 = require("../utils/http.js");
async function recordResult(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const entry = await gameService_js_1.gameService.record(uid, req.body);
    (0, http_js_1.ok)(res, { entry }, 201);
}
async function getSummary(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const summary = await gameService_js_1.gameService.summary(uid);
    (0, http_js_1.ok)(res, summary);
}
//# sourceMappingURL=gameController.js.map
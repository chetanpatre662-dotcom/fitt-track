"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfile = getProfile;
exports.putProfile = putProfile;
const auth_js_1 = require("../middleware/auth.js");
const profileService_js_1 = require("../services/profileService.js");
const http_js_1 = require("../utils/http.js");
async function getProfile(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const profile = await profileService_js_1.profileService.get(uid);
    (0, http_js_1.ok)(res, { profile });
}
async function putProfile(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const profile = await profileService_js_1.profileService.upsert(uid, req.body);
    (0, http_js_1.ok)(res, { profile });
}
//# sourceMappingURL=profileController.js.map
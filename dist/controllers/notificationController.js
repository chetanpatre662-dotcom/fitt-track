"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerToken = registerToken;
exports.removeToken = removeToken;
const auth_js_1 = require("../middleware/auth.js");
const userRepository_js_1 = require("../repositories/userRepository.js");
const http_js_1 = require("../utils/http.js");
async function registerToken(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { token } = req.body;
    await userRepository_js_1.userRepository.addFcmToken(uid, token);
    (0, http_js_1.ok)(res, { registered: true });
}
async function removeToken(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { token } = req.body;
    await userRepository_js_1.userRepository.removeFcmToken(uid, token);
    (0, http_js_1.ok)(res, { removed: true });
}
//# sourceMappingURL=notificationController.js.map
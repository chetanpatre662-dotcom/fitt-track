"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const env_js_1 = require("../config/env.js");
const http_js_1 = require("../utils/http.js");
const router = (0, express_1.Router)();
/**
 * Liveness + configuration status. Safe to expose: reports only whether
 * credentials are present, never their values.
 */
router.get('/', (_req, res) => {
    (0, http_js_1.ok)(res, {
        status: 'ok',
        service: 'fittrack-backend',
        time: new Date().toISOString(),
        env: env_js_1.env.NODE_ENV,
        config: {
            firebase: (0, env_js_1.hasFirebaseCredentials)(),
            gemini: (0, env_js_1.hasGeminiCredentials)(),
        },
    });
});
exports.default = router;
//# sourceMappingURL=health.routes.js.map
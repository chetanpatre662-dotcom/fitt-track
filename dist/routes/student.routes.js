"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const validate_js_1 = require("../middleware/validate.js");
const http_js_1 = require("../utils/http.js");
const trainerValidators_js_1 = require("../validators/trainerValidators.js");
const c = __importStar(require("../controllers/studentController.js"));
const router = (0, express_1.Router)();
// Student relationship routes require a valid token; any authenticated user may
// read their own trainer card and toggle their own sharing preference.
router.use(auth_js_1.authenticate);
router.get('/trainer', (0, http_js_1.asyncHandler)(c.getTrainer));
// Student-initiated leave/withdraw: keyed by the authenticated uid, so there is
// no request body and no validate() middleware.
router.delete('/trainer', (0, http_js_1.asyncHandler)(c.leaveTrainer));
router.post('/connect-trainer', (0, validate_js_1.validate)({ body: trainerValidators_js_1.linkTrainerSchema }), (0, http_js_1.asyncHandler)(c.connectTrainer));
router.patch('/trainer/sharing', (0, validate_js_1.validate)({ body: trainerValidators_js_1.sharingPatchUnifiedSchema }), (0, http_js_1.asyncHandler)(c.setSharing));
router.get('/diet-plan', (0, http_js_1.asyncHandler)(c.getDietPlan));
router.get('/assigned-workouts', (0, http_js_1.asyncHandler)(c.getAssignedWorkouts));
exports.default = router;
//# sourceMappingURL=student.routes.js.map
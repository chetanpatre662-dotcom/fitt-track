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
const rateLimit_js_1 = require("../middleware/rateLimit.js");
const http_js_1 = require("../utils/http.js");
const aiValidators_js_1 = require("../validators/aiValidators.js");
const c = __importStar(require("../controllers/aiController.js"));
const router = (0, express_1.Router)();
// AI routes require auth and use a stricter rate limit (Gemini calls cost).
router.use(auth_js_1.authenticate);
router.use(rateLimit_js_1.aiLimiter);
router.post('/daily-insight', (0, http_js_1.asyncHandler)(c.dailyInsight));
router.post('/workout-recommendation', (0, validate_js_1.validate)({ body: aiValidators_js_1.workoutRecoSchema }), (0, http_js_1.asyncHandler)(c.workoutRecommendation));
router.post('/generate-workout', (0, validate_js_1.validate)({ body: aiValidators_js_1.generateWorkoutSchema }), (0, http_js_1.asyncHandler)(c.generateWorkout));
router.post('/nutrition-recommendation', (0, http_js_1.asyncHandler)(c.nutritionRecommendation));
router.post('/exercise-substitution', (0, validate_js_1.validate)({ body: aiValidators_js_1.substitutionRequestSchema }), (0, http_js_1.asyncHandler)(c.exerciseSubstitution));
router.post('/recovery', (0, http_js_1.asyncHandler)(c.recovery));
router.post('/progress-analysis', (0, http_js_1.asyncHandler)(c.progressAnalysis));
router.post('/chat', (0, validate_js_1.validate)({ body: aiValidators_js_1.chatSchema }), (0, http_js_1.asyncHandler)(c.chat));
exports.default = router;
//# sourceMappingURL=ai.routes.js.map
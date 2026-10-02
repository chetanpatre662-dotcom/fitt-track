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
const progressValidators_js_1 = require("../validators/progressValidators.js");
const measurementValidators_js_1 = require("../validators/measurementValidators.js");
const progressPhotoValidators_js_1 = require("../validators/progressPhotoValidators.js");
const c = __importStar(require("../controllers/progressController.js"));
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticate);
router.get('/', (0, validate_js_1.validate)({ query: progressValidators_js_1.rangeQuerySchema }), (0, http_js_1.asyncHandler)(c.getWorkoutProgress));
router.get('/workouts', (0, validate_js_1.validate)({ query: progressValidators_js_1.rangeQuerySchema }), (0, http_js_1.asyncHandler)(c.getWorkoutProgress));
router.get('/history', (0, validate_js_1.validate)({ query: progressValidators_js_1.rangeQuerySchema }), (0, http_js_1.asyncHandler)(c.getWorkoutHistory));
router.get('/exercise', (0, validate_js_1.validate)({ query: progressValidators_js_1.exerciseProgressionQuerySchema }), (0, http_js_1.asyncHandler)(c.getExerciseProgression));
router.get('/records', (0, http_js_1.asyncHandler)(c.getPersonalRecords));
// Body-measurement history (height/weight over time).
router.get('/measurements', (0, http_js_1.asyncHandler)(c.getMeasurements));
router.post('/measurements', (0, validate_js_1.validate)({ body: measurementValidators_js_1.measurementCreateSchema }), (0, http_js_1.asyncHandler)(c.addMeasurement));
// Private progress photos (metadata; image bytes live in Firebase Storage).
router.get('/photos', (0, http_js_1.asyncHandler)(c.getProgressPhotos));
router.post('/photos', (0, validate_js_1.validate)({ body: progressPhotoValidators_js_1.progressPhotoCreateSchema }), (0, http_js_1.asyncHandler)(c.addProgressPhoto));
router.delete('/photos/:id', (0, validate_js_1.validate)({ params: progressPhotoValidators_js_1.progressPhotoIdParamsSchema }), (0, http_js_1.asyncHandler)(c.deleteProgressPhoto));
exports.default = router;
//# sourceMappingURL=progress.routes.js.map
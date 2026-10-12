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
const role_js_1 = require("../middleware/role.js");
const validate_js_1 = require("../middleware/validate.js");
const http_js_1 = require("../utils/http.js");
const trainerValidators_js_1 = require("../validators/trainerValidators.js");
const measurementValidators_js_1 = require("../validators/measurementValidators.js");
const progressValidators_js_1 = require("../validators/progressValidators.js");
const c = __importStar(require("../controllers/trainerController.js"));
const router = (0, express_1.Router)();
// Every trainer route requires a valid token AND a server-resolved trainer role.
router.use(auth_js_1.authenticate);
router.use(role_js_1.requireTrainer);
router.get('/profile', (0, http_js_1.asyncHandler)(c.getProfile));
router.get('/students', (0, http_js_1.asyncHandler)(c.listStudents));
// Referral-code management (self-service, trainer-only).
router.get('/referral-code/availability', (0, validate_js_1.validate)({ query: trainerValidators_js_1.availabilityQuerySchema }), (0, http_js_1.asyncHandler)(c.checkReferralCodeAvailability));
router.get('/referral-code', (0, http_js_1.asyncHandler)(c.getReferralCode));
router.post('/referral-code', (0, http_js_1.asyncHandler)(c.generateReferralCode));
router.patch('/referral-code', (0, validate_js_1.validate)({ body: trainerValidators_js_1.referralCodeSchema }), (0, http_js_1.asyncHandler)(c.setReferralCode));
const studentParams = { params: trainerValidators_js_1.studentUidParamsSchema };
// Connect-request inbox (trainer-only): list pending, approve/reject.
router.get('/requests', (0, http_js_1.asyncHandler)(c.listRequests));
// Batch approve/reject. REGISTERED BEFORE the /requests/:studentUid param
// routes on purpose: Express matches in registration order, so the literal
// `batch/` segment must come first or the :studentUid param route would capture
// it. See design §6 route-collision constraint.
router.post('/requests/batch/approve', (0, validate_js_1.validate)({ body: trainerValidators_js_1.batchStudentUidsSchema }), (0, http_js_1.asyncHandler)(c.batchApproveRequests));
router.post('/requests/batch/reject', (0, validate_js_1.validate)({ body: trainerValidators_js_1.batchStudentUidsSchema }), (0, http_js_1.asyncHandler)(c.batchRejectRequests));
router.post('/requests/:studentUid/approve', (0, validate_js_1.validate)(studentParams), (0, http_js_1.asyncHandler)(c.approveRequest));
router.post('/requests/:studentUid/reject', (0, validate_js_1.validate)(studentParams), (0, http_js_1.asyncHandler)(c.rejectRequest));
router.get('/students/:studentUid/overview', (0, validate_js_1.validate)(studentParams), (0, http_js_1.asyncHandler)(c.studentOverview));
// Remove a student from the trainer (§5): non-destructive status flip, never a
// data/account deletion.
router.delete('/students/:studentUid', (0, validate_js_1.validate)(studentParams), (0, http_js_1.asyncHandler)(c.removeStudent));
router.get('/students/:studentUid/workouts', (0, validate_js_1.validate)({ ...studentParams, query: trainerValidators_js_1.dateQuerySchema }), (0, http_js_1.asyncHandler)(c.studentWorkouts));
router.get('/students/:studentUid/workouts/history', (0, validate_js_1.validate)({ ...studentParams, query: trainerValidators_js_1.historyQuerySchema }), (0, http_js_1.asyncHandler)(c.studentWorkoutHistory));
router.get('/students/:studentUid/nutrition', (0, validate_js_1.validate)({ ...studentParams, query: trainerValidators_js_1.dateQuerySchema }), (0, http_js_1.asyncHandler)(c.studentNutrition));
router.get('/students/:studentUid/water', (0, validate_js_1.validate)({ ...studentParams, query: trainerValidators_js_1.dateQuerySchema }), (0, http_js_1.asyncHandler)(c.studentWater));
router.get('/students/:studentUid/progress', (0, validate_js_1.validate)(studentParams), (0, http_js_1.asyncHandler)(c.studentProgress));
router.get('/students/:studentUid/photos', (0, validate_js_1.validate)(studentParams), (0, http_js_1.asyncHandler)(c.studentPhotos));
router.get('/students/:studentUid/measurements', (0, validate_js_1.validate)(studentParams), (0, http_js_1.asyncHandler)(c.studentMeasurements));
// Append a dated body-measurement record for the student (reuses the SAME
// validator + service as the student path; Admin-SDK-mediated, no rule change).
router.post('/students/:studentUid/measurements', (0, validate_js_1.validate)({ ...studentParams, body: measurementValidators_js_1.measurementCreateSchema }), (0, http_js_1.asyncHandler)(c.addStudentMeasurement));
router.get('/students/:studentUid/exercise', (0, validate_js_1.validate)({ ...studentParams, query: progressValidators_js_1.exerciseProgressionQuerySchema }), (0, http_js_1.asyncHandler)(c.studentExerciseProgression));
router.get('/students/:studentUid/records', (0, validate_js_1.validate)(studentParams), (0, http_js_1.asyncHandler)(c.studentRecords));
router.get('/students/:studentUid/diet-plan', (0, validate_js_1.validate)(studentParams), (0, http_js_1.asyncHandler)(c.studentDietPlan));
// Assign/replace a student's diet plan (text and/or uploaded image).
router.post('/students/:studentUid/diet-plan', (0, validate_js_1.validate)({ ...studentParams, body: trainerValidators_js_1.dietPlanUpsertSchema }), (0, http_js_1.asyncHandler)(c.assignDietPlan));
// Schedule a workout for a student from a template of exercises.
router.post('/students/:studentUid/workouts/assign', (0, validate_js_1.validate)({ ...studentParams, body: trainerValidators_js_1.assignWorkoutSchema }), (0, http_js_1.asyncHandler)(c.assignWorkout));
// Single-workout detail. REGISTERED LAST on purpose: Express matches routes in
// registration order, so the :workoutId param route MUST come after the literal
// /workouts/history and /workouts/assign segments above or it would capture
// them. See design §3 route-ordering constraint.
router.get('/students/:studentUid/workouts/:workoutId', (0, validate_js_1.validate)({ params: trainerValidators_js_1.workoutDetailParamsSchema }), (0, http_js_1.asyncHandler)(c.studentWorkoutDetail));
exports.default = router;
//# sourceMappingURL=trainer.routes.js.map
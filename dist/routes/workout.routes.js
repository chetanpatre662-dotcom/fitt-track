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
const workoutValidators_js_1 = require("../validators/workoutValidators.js");
const c = __importStar(require("../controllers/workoutController.js"));
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticate);
router.get('/', (0, validate_js_1.validate)({ query: workoutValidators_js_1.workoutListQuerySchema }), (0, http_js_1.asyncHandler)(c.listWorkouts));
router.post('/', (0, validate_js_1.validate)({ body: workoutValidators_js_1.workoutUpsertSchema }), (0, http_js_1.asyncHandler)(c.createWorkout));
router.get('/:id', (0, validate_js_1.validate)({ params: workoutValidators_js_1.workoutIdParamsSchema }), (0, http_js_1.asyncHandler)(c.getWorkout));
router.put('/:id', (0, validate_js_1.validate)({ params: workoutValidators_js_1.workoutIdParamsSchema, body: workoutValidators_js_1.workoutUpsertSchema }), (0, http_js_1.asyncHandler)(c.updateWorkout));
router.patch('/:id/status', (0, validate_js_1.validate)({ params: workoutValidators_js_1.workoutIdParamsSchema, body: workoutValidators_js_1.workoutStatusSchema }), (0, http_js_1.asyncHandler)(c.setWorkoutStatus));
router.post('/:id/duplicate', (0, validate_js_1.validate)({ params: workoutValidators_js_1.workoutIdParamsSchema }), (0, http_js_1.asyncHandler)(c.duplicateWorkout));
router.delete('/:id', (0, validate_js_1.validate)({ params: workoutValidators_js_1.workoutIdParamsSchema }), (0, http_js_1.asyncHandler)(c.deleteWorkout));
exports.default = router;
//# sourceMappingURL=workout.routes.js.map
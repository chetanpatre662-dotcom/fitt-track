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
const c = __importStar(require("../controllers/trainerController.js"));
const router = (0, express_1.Router)();
// Every trainer route requires a valid token AND a server-resolved trainer role.
router.use(auth_js_1.authenticate);
router.use(role_js_1.requireTrainer);
router.get('/profile', (0, http_js_1.asyncHandler)(c.getProfile));
router.get('/students', (0, http_js_1.asyncHandler)(c.listStudents));
const studentParams = { params: trainerValidators_js_1.studentUidParamsSchema };
router.get('/students/:studentUid/overview', (0, validate_js_1.validate)(studentParams), (0, http_js_1.asyncHandler)(c.studentOverview));
router.get('/students/:studentUid/workouts', (0, validate_js_1.validate)({ ...studentParams, query: trainerValidators_js_1.dateQuerySchema }), (0, http_js_1.asyncHandler)(c.studentWorkouts));
router.get('/students/:studentUid/workouts/history', (0, validate_js_1.validate)({ ...studentParams, query: trainerValidators_js_1.historyQuerySchema }), (0, http_js_1.asyncHandler)(c.studentWorkoutHistory));
router.get('/students/:studentUid/nutrition', (0, validate_js_1.validate)({ ...studentParams, query: trainerValidators_js_1.dateQuerySchema }), (0, http_js_1.asyncHandler)(c.studentNutrition));
router.get('/students/:studentUid/water', (0, validate_js_1.validate)({ ...studentParams, query: trainerValidators_js_1.dateQuerySchema }), (0, http_js_1.asyncHandler)(c.studentWater));
router.get('/students/:studentUid/progress', (0, validate_js_1.validate)(studentParams), (0, http_js_1.asyncHandler)(c.studentProgress));
router.get('/students/:studentUid/photos', (0, validate_js_1.validate)(studentParams), (0, http_js_1.asyncHandler)(c.studentPhotos));
exports.default = router;
//# sourceMappingURL=trainer.routes.js.map
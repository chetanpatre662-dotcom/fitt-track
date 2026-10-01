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
const nutritionValidators_js_1 = require("../validators/nutritionValidators.js");
const c = __importStar(require("../controllers/nutritionController.js"));
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticate);
router.get('/today', (0, validate_js_1.validate)({ query: nutritionValidators_js_1.nutritionDayQuerySchema }), (0, http_js_1.asyncHandler)(c.getToday));
router.get('/foods/search', (0, validate_js_1.validate)({ query: nutritionValidators_js_1.foodSearchQuerySchema }), (0, http_js_1.asyncHandler)(c.searchFoods));
router.get('/custom-foods', (0, http_js_1.asyncHandler)(c.listCustomFoods));
router.post('/custom-foods', (0, validate_js_1.validate)({ body: nutritionValidators_js_1.customFoodUpsertSchema }), (0, http_js_1.asyncHandler)(c.saveCustomFood));
router.delete('/custom-foods/:id', (0, validate_js_1.validate)({ params: nutritionValidators_js_1.foodLogIdParamsSchema }), (0, http_js_1.asyncHandler)(c.deleteCustomFood));
router.post('/food', (0, validate_js_1.validate)({ body: nutritionValidators_js_1.foodLogUpsertSchema }), (0, http_js_1.asyncHandler)(c.addFood));
router.put('/food/:id', (0, validate_js_1.validate)({ params: nutritionValidators_js_1.foodLogIdParamsSchema, body: nutritionValidators_js_1.foodLogUpsertSchema }), (0, http_js_1.asyncHandler)(c.updateFood));
router.delete('/food/:id', (0, validate_js_1.validate)({ params: nutritionValidators_js_1.foodLogIdParamsSchema }), (0, http_js_1.asyncHandler)(c.deleteFood));
exports.default = router;
//# sourceMappingURL=nutrition.routes.js.map
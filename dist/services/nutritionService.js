"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nutritionService = exports.NutritionService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const foodSeed_js_1 = require("../data/foodSeed.js");
const nutritionRepository_js_1 = require("../repositories/nutritionRepository.js");
const errors_js_1 = require("../utils/errors.js");
const nutritionCalc_js_1 = require("../utils/nutritionCalc.js");
/**
 * Nutrition service: food search (reference + user custom foods), food logging,
 * and daily totals aggregation. Reference foods are served from the bundled
 * seed for fast, offline-friendly search; custom foods come from Firestore.
 */
class NutritionService {
    /** Searches reference + custom foods by keyword. */
    async searchFoods(uid, q, limit = 25) {
        const needle = q.trim().toLowerCase();
        const refMatches = foodSeed_js_1.FOODS.filter((food) => {
            const hay = [food.name, ...food.keywords].join(' ').toLowerCase();
            return hay.includes(needle);
        });
        // Include the user's custom foods, mapped to the same shape.
        const custom = await nutritionRepository_js_1.nutritionRepository.listCustomFoods(uid);
        const customMatches = custom
            .map((c) => ({
            id: c.id,
            name: c.name ?? '',
            servingSize: c.servingSize ?? '1 serving',
            servingGrams: 0,
            calories: c.calories ?? 0,
            protein: c.protein ?? 0,
            carbs: c.carbs ?? 0,
            fat: c.fat ?? 0,
            fiber: c.fiber ?? 0,
            sugar: c.sugar ?? 0,
            sodium: c.sodium ?? 0,
            keywords: ['custom'],
        }))
            .filter((food) => food.name.toLowerCase().includes(needle));
        return [...customMatches, ...refMatches].slice(0, limit);
    }
    /** Returns the day's entries grouped by meal, with per-meal and total macros. */
    async getDay(uid, dateKey) {
        const rows = await nutritionRepository_js_1.nutritionRepository.listByDate(uid, dateKey);
        const entries = rows.map((r) => ({
            id: r.id,
            mealType: r.mealType ?? 'snack',
            name: r.name ?? '',
            quantity: r.quantity ?? 1,
            calories: r.calories ?? 0,
            protein: r.protein ?? 0,
            carbs: r.carbs ?? 0,
            fat: r.fat ?? 0,
            fiber: r.fiber ?? 0,
            sugar: r.sugar ?? 0,
            sodium: r.sodium ?? 0,
        }));
        const grouped = (0, nutritionCalc_js_1.groupByMeal)(entries);
        return { dateKey, entries, ...grouped };
    }
    async addFood(uid, input) {
        const id = nutritionRepository_js_1.nutritionRepository.newLogId(uid);
        return nutritionRepository_js_1.nutritionRepository.setLog(uid, id, {
            ...input,
            foodId: input.foodId ?? null,
            createdAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    async updateFood(uid, id, input) {
        const existing = await nutritionRepository_js_1.nutritionRepository.getLog(uid, id);
        if (!existing)
            throw new errors_js_1.NotFoundError('Food log entry not found');
        return nutritionRepository_js_1.nutritionRepository.setLog(uid, id, { ...input, foodId: input.foodId ?? null });
    }
    async deleteFood(uid, id) {
        const existing = await nutritionRepository_js_1.nutritionRepository.getLog(uid, id);
        if (!existing)
            throw new errors_js_1.NotFoundError('Food log entry not found');
        await nutritionRepository_js_1.nutritionRepository.deleteLog(uid, id);
    }
    // --- Custom foods / favorites ---
    async saveCustomFood(uid, input) {
        const id = nutritionRepository_js_1.nutritionRepository.newCustomFoodId(uid);
        return nutritionRepository_js_1.nutritionRepository.setCustomFood(uid, id, {
            ...input,
            createdAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    async listCustomFoods(uid) {
        return nutritionRepository_js_1.nutritionRepository.listCustomFoods(uid);
    }
    async deleteCustomFood(uid, id) {
        await nutritionRepository_js_1.nutritionRepository.deleteCustomFood(uid, id);
    }
}
exports.NutritionService = NutritionService;
exports.nutritionService = new NutritionService();
//# sourceMappingURL=nutritionService.js.map
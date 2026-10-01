"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getToday = getToday;
exports.searchFoods = searchFoods;
exports.addFood = addFood;
exports.updateFood = updateFood;
exports.deleteFood = deleteFood;
exports.listCustomFoods = listCustomFoods;
exports.saveCustomFood = saveCustomFood;
exports.deleteCustomFood = deleteCustomFood;
const auth_js_1 = require("../middleware/auth.js");
const nutritionService_js_1 = require("../services/nutritionService.js");
const http_js_1 = require("../utils/http.js");
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
        .getDate()
        .toString()
        .padStart(2, '0')}`;
}
async function getToday(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { date } = req.query;
    const day = await nutritionService_js_1.nutritionService.getDay(uid, date ?? todayKey());
    (0, http_js_1.ok)(res, day);
}
async function searchFoods(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { q, limit } = req.query;
    const foods = await nutritionService_js_1.nutritionService.searchFoods(uid, q, limit);
    (0, http_js_1.ok)(res, { foods });
}
async function addFood(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const entry = await nutritionService_js_1.nutritionService.addFood(uid, req.body);
    (0, http_js_1.ok)(res, { entry }, 201);
}
async function updateFood(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const entry = await nutritionService_js_1.nutritionService.updateFood(uid, req.params.id, req.body);
    (0, http_js_1.ok)(res, { entry });
}
async function deleteFood(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    await nutritionService_js_1.nutritionService.deleteFood(uid, req.params.id);
    (0, http_js_1.ok)(res, { deleted: true });
}
async function listCustomFoods(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const foods = await nutritionService_js_1.nutritionService.listCustomFoods(uid);
    (0, http_js_1.ok)(res, { foods });
}
async function saveCustomFood(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const food = await nutritionService_js_1.nutritionService.saveCustomFood(uid, req.body);
    (0, http_js_1.ok)(res, { food }, 201);
}
async function deleteCustomFood(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    await nutritionService_js_1.nutritionService.deleteCustomFood(uid, req.params.id);
    (0, http_js_1.ok)(res, { deleted: true });
}
//# sourceMappingURL=nutritionController.js.map
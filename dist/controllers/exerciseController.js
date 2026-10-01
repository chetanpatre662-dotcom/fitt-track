"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listExercises = listExercises;
exports.searchExercises = searchExercises;
exports.getExercise = getExercise;
const exerciseService_js_1 = require("../services/exerciseService.js");
const http_js_1 = require("../utils/http.js");
async function listExercises(req, res) {
    const q = req.query;
    const { items, total } = await exerciseService_js_1.exerciseService.list(q);
    (0, http_js_1.ok)(res, { exercises: items, total });
}
async function searchExercises(req, res) {
    const query = req.query;
    const { items, total } = await exerciseService_js_1.exerciseService.list({ q: query.q, limit: query.limit });
    (0, http_js_1.ok)(res, { exercises: items, total });
}
async function getExercise(req, res) {
    const exercise = await exerciseService_js_1.exerciseService.getById(req.params.id);
    (0, http_js_1.ok)(res, { exercise });
}
//# sourceMappingURL=exerciseController.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyInsight = dailyInsight;
exports.workoutRecommendation = workoutRecommendation;
exports.generateWorkout = generateWorkout;
exports.nutritionRecommendation = nutritionRecommendation;
exports.exerciseSubstitution = exerciseSubstitution;
exports.recovery = recovery;
exports.progressAnalysis = progressAnalysis;
exports.chat = chat;
const auth_js_1 = require("../middleware/auth.js");
const aiService_js_1 = require("../services/aiService.js");
const aiConversationRepository_js_1 = require("../repositories/aiConversationRepository.js");
const http_js_1 = require("../utils/http.js");
async function dailyInsight(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const insight = await aiService_js_1.aiService.dailyInsight(uid);
    (0, http_js_1.ok)(res, { insight });
}
async function workoutRecommendation(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const body = req.body;
    const recommendation = await aiService_js_1.aiService.workoutRecommendation({ uid, ...body });
    (0, http_js_1.ok)(res, { recommendation });
}
async function generateWorkout(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const body = req.body;
    const recommendation = await aiService_js_1.aiService.generateWorkout({ uid, ...body });
    (0, http_js_1.ok)(res, { recommendation });
}
async function nutritionRecommendation(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const recommendation = await aiService_js_1.aiService.nutritionRecommendation(uid);
    (0, http_js_1.ok)(res, { recommendation });
}
async function exerciseSubstitution(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { exerciseId } = req.body;
    const result = await aiService_js_1.aiService.exerciseSubstitution({ uid, exerciseId });
    (0, http_js_1.ok)(res, { result });
}
async function recovery(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const result = await aiService_js_1.aiService.recovery(uid);
    (0, http_js_1.ok)(res, { result });
}
async function progressAnalysis(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const result = await aiService_js_1.aiService.progressAnalysis(uid);
    (0, http_js_1.ok)(res, { result });
}
async function chat(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { message, conversationId } = req.body;
    const convId = await aiConversationRepository_js_1.aiConversationRepository.ensureConversation(uid, conversationId);
    const history = await aiConversationRepository_js_1.aiConversationRepository.recentMessages(uid, convId, 8);
    const reply = await aiService_js_1.aiService.chat(uid, message, history);
    // Persist both turns (best-effort — do not fail the response if this errors).
    await aiConversationRepository_js_1.aiConversationRepository.addMessage(uid, convId, 'user', message).catch(() => { });
    await aiConversationRepository_js_1.aiConversationRepository.addMessage(uid, convId, 'assistant', reply).catch(() => { });
    (0, http_js_1.ok)(res, { conversationId: convId, reply });
}
//# sourceMappingURL=aiController.js.map
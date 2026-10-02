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
exports.listConversations = listConversations;
exports.getConversationMessages = getConversationMessages;
exports.getDailyPlan = getDailyPlan;
exports.generateDailyPlan = generateDailyPlan;
exports.updateDailyPlan = updateDailyPlan;
const auth_js_1 = require("../middleware/auth.js");
const aiService_js_1 = require("../services/aiService.js");
const dailyPlanService_js_1 = require("../services/dailyPlanService.js");
const aiConversationRepository_js_1 = require("../repositories/aiConversationRepository.js");
const aiConversationService_js_1 = require("../services/aiConversationService.js");
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
    // Feed the single persisted daily plan into chat so it references the SAME
    // plan the Plans screen shows (never a contradictory one). Best-effort.
    const currentPlan = await dailyPlanService_js_1.dailyPlanService.get(uid).catch(() => null);
    const todaysPlan = await dailyPlanService_js_1.dailyPlanService.summarizeForChat(uid).catch(() => null);
    const reply = await aiService_js_1.aiService.chat(uid, message, history, todaysPlan);
    // Detect (but DO NOT apply) a workout-plan modification request. When found,
    // we return a structured proposal the client confirms before persisting via
    // the existing daily-plan update endpoint — chat never silently mutates the
    // plan. Best-effort: failure falls back to a normal chat reply.
    const detection = await aiService_js_1.aiService
        .detectPlanModification(message, currentPlan?.muscleGroups ?? [])
        .catch(() => ({ isModification: false, muscleGroups: [] }));
    const proposedPlanChange = detection.isModification
        ? { muscleGroups: detection.muscleGroups }
        : null;
    // Persist both turns (best-effort — do not fail the response if this errors).
    await aiConversationRepository_js_1.aiConversationRepository.addMessage(uid, convId, 'user', message).catch(() => { });
    await aiConversationRepository_js_1.aiConversationRepository.addMessage(uid, convId, 'assistant', reply).catch(() => { });
    (0, http_js_1.ok)(res, { conversationId: convId, reply, proposedPlanChange });
}
// --- AI chat history (reuses the existing aiConversations persistence) ---
async function listConversations(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const conversations = await aiConversationService_js_1.aiConversationService.listConversations(uid);
    (0, http_js_1.ok)(res, { conversations });
}
async function getConversationMessages(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { id } = req.params;
    const messages = await aiConversationService_js_1.aiConversationService.getMessages(uid, id);
    (0, http_js_1.ok)(res, { messages });
}
// --- Daily plan (single source of truth for "today's workout") ---
async function getDailyPlan(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const { date } = req.query;
    const plan = await dailyPlanService_js_1.dailyPlanService.get(uid, date);
    (0, http_js_1.ok)(res, { plan });
}
async function generateDailyPlan(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const plan = await dailyPlanService_js_1.dailyPlanService.generate(uid, req.body);
    (0, http_js_1.ok)(res, { plan });
}
async function updateDailyPlan(req, res) {
    const uid = (0, auth_js_1.requireUid)(req);
    const plan = await dailyPlanService_js_1.dailyPlanService.update(uid, req.body);
    (0, http_js_1.ok)(res, { plan });
}
//# sourceMappingURL=aiController.js.map
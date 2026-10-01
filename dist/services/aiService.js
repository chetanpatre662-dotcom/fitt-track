"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiService = exports.AiService = void 0;
const geminiClient_js_1 = require("../ai/geminiClient.js");
const validateExerciseIds_js_1 = require("../ai/validateExerciseIds.js");
const prompts_js_1 = require("../ai/prompts.js");
const schemas_js_1 = require("../ai/schemas.js");
const aiContextService_js_1 = require("./aiContextService.js");
const exerciseService_js_1 = require("./exerciseService.js");
const logger_js_1 = require("../utils/logger.js");
/** Local date key (yyyy-MM-dd). */
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
        .getDate()
        .toString()
        .padStart(2, '0')}`;
}
/**
 * AI Coach business logic. Builds compact context, calls Gemini for structured
 * JSON, validates responses (Zod) and exercise IDs (against the library), and
 * returns validated results. Never auto-modifies user records — the app asks
 * the user to confirm before applying any recommendation.
 */
class AiService {
    async dailyInsight(uid) {
        const [user, workouts, nutrition] = await Promise.all([
            aiContextService_js_1.aiContextService.userContext(uid),
            aiContextService_js_1.aiContextService.recentWorkouts(uid, 4),
            aiContextService_js_1.aiContextService.todayNutrition(uid, todayKey()),
        ]);
        const prompt = [
            'Write a short (2-3 sentence) personalized daily insight for the user.',
            (0, prompts_js_1.contextBlock)('USER', user),
            (0, prompts_js_1.contextBlock)('RECENT_WORKOUTS', workouts),
            (0, prompts_js_1.contextBlock)('TODAY_NUTRITION', nutrition),
            'Return JSON: { "insight": string, "focus": string }',
        ].join('\n\n');
        try {
            const raw = await (0, geminiClient_js_1.generateJson)({
                systemInstruction: prompts_js_1.SAFETY_SYSTEM_PROMPT,
                prompt,
                responseSchema: schemas_js_1.geminiSchemas.dailyInsight,
                temperature: 0.8,
            });
            return schemas_js_1.dailyInsightSchema.parse(raw);
        }
        catch (err) {
            logger_js_1.logger.warn({ err }, 'dailyInsight fallback');
            return {
                insight: workouts.length === 0
                    ? 'Ready to start? A short workout today builds momentum toward your goal.'
                    : 'Nice consistency lately — keep your protein and water on target today.',
                focus: '',
            };
        }
    }
    async workoutRecommendation(params) {
        const { uid } = params;
        const [user, recency, candidates] = await Promise.all([
            aiContextService_js_1.aiContextService.userContext(uid),
            aiContextService_js_1.aiContextService.muscleRecency(uid),
            aiContextService_js_1.aiContextService.candidateExercises({
                location: params.location,
                muscle: params.muscle,
                equipment: (await aiContextService_js_1.aiContextService.userContext(uid)).equipment,
                limit: 40,
            }),
        ]);
        const validIds = new Set(candidates.map((c) => c.id));
        const prompt = [
            `Recommend a ${params.durationMinutes ?? 45}-minute workout${params.muscle ? ` focused on ${params.muscle}` : ''}.`,
            'Consider the user\'s goal, level, equipment, and recently trained muscles (avoid overtraining muscles trained in the last ~2 days).',
            'Pick exercises ONLY from CANDIDATES using their exact "id" as exerciseId. Never invent ids.',
            (0, prompts_js_1.contextBlock)('USER', user),
            (0, prompts_js_1.contextBlock)('MUSCLE_LAST_TRAINED', recency),
            (0, prompts_js_1.contextBlock)('CANDIDATES', candidates),
        ].join('\n\n');
        const raw = await (0, geminiClient_js_1.generateJson)({
            systemInstruction: prompts_js_1.SAFETY_SYSTEM_PROMPT,
            prompt,
            responseSchema: schemas_js_1.geminiSchemas.workoutRecommendation,
            temperature: 0.6,
        });
        const parsed = schemas_js_1.workoutRecommendationSchema.parse(raw);
        // Drop any invented exercise IDs.
        parsed.exercises = (0, validateExerciseIds_js_1.keepValidExerciseIds)(parsed.exercises, validIds);
        if (parsed.exercises.length === 0) {
            // Safe fallback: build from top candidates.
            parsed.exercises = candidates.slice(0, 5).map((c) => ({
                exerciseId: c.id,
                sets: 3,
                repMin: 8,
                repMax: 12,
                restSeconds: 90,
                reason: 'Matched to your equipment and target.',
            }));
        }
        return parsed;
    }
    async generateWorkout(params) {
        return this.workoutRecommendation(params);
    }
    async nutritionRecommendation(uid) {
        const [user, nutrition, workouts] = await Promise.all([
            aiContextService_js_1.aiContextService.userContext(uid),
            aiContextService_js_1.aiContextService.todayNutrition(uid, todayKey()),
            aiContextService_js_1.aiContextService.recentWorkouts(uid, 2),
        ]);
        const prompt = [
            'Given the user\'s goal, today\'s intake vs targets, and recent training, suggest practical foods for the rest of today.',
            'General guidance only — no medical advice, no extreme dieting.',
            (0, prompts_js_1.contextBlock)('USER', user),
            (0, prompts_js_1.contextBlock)('TODAY_NUTRITION', nutrition),
            (0, prompts_js_1.contextBlock)('RECENT_WORKOUTS', workouts),
        ].join('\n\n');
        try {
            const raw = await (0, geminiClient_js_1.generateJson)({
                systemInstruction: prompts_js_1.SAFETY_SYSTEM_PROMPT,
                prompt,
                responseSchema: schemas_js_1.geminiSchemas.nutritionRecommendation,
                temperature: 0.7,
            });
            return schemas_js_1.nutritionRecommendationSchema.parse(raw);
        }
        catch (err) {
            logger_js_1.logger.warn({ err }, 'nutritionRecommendation fallback');
            return {
                summary: 'Aim to hit your remaining protein target with a balanced meal (protein + carbs + vegetables).',
                suggestions: [],
            };
        }
    }
    async exerciseSubstitution(params) {
        const original = await exerciseService_js_1.exerciseService.getById(params.exerciseId);
        const user = await aiContextService_js_1.aiContextService.userContext(params.uid);
        const candidates = await aiContextService_js_1.aiContextService.candidateExercises({
            muscle: original.primaryMuscle,
            equipment: user.equipment,
            limit: 30,
        });
        const validIds = new Set(candidates.map((c) => c.id));
        const prompt = [
            `Suggest up to 4 alternative exercises for "${original.name}" (${original.primaryMuscle}).`,
            'Use ONLY ids from CANDIDATES. Consider the user\'s available equipment.',
            (0, prompts_js_1.contextBlock)('USER', user),
            (0, prompts_js_1.contextBlock)('ORIGINAL', { id: original.id, name: original.name, primaryMuscle: original.primaryMuscle }),
            (0, prompts_js_1.contextBlock)('CANDIDATES', candidates),
        ].join('\n\n');
        const raw = await (0, geminiClient_js_1.generateJson)({
            systemInstruction: prompts_js_1.SAFETY_SYSTEM_PROMPT,
            prompt,
            responseSchema: schemas_js_1.geminiSchemas.substitution,
            temperature: 0.5,
        });
        const parsed = schemas_js_1.substitutionSchema.parse(raw);
        parsed.alternatives = (0, validateExerciseIds_js_1.keepValidExerciseIds)(parsed.alternatives, validIds).filter((a) => a.exerciseId !== params.exerciseId);
        return parsed;
    }
    async recovery(uid) {
        const [user, recency] = await Promise.all([
            aiContextService_js_1.aiContextService.userContext(uid),
            aiContextService_js_1.aiContextService.muscleRecency(uid),
        ]);
        const prompt = [
            'Given recently trained muscles, advise which muscle groups are ready to train and which should rest today.',
            'This is a fitness-planning heuristic, not medical advice.',
            (0, prompts_js_1.contextBlock)('USER', user),
            (0, prompts_js_1.contextBlock)('MUSCLE_LAST_TRAINED', recency),
        ].join('\n\n');
        try {
            const raw = await (0, geminiClient_js_1.generateJson)({
                systemInstruction: prompts_js_1.SAFETY_SYSTEM_PROMPT,
                prompt,
                responseSchema: schemas_js_1.geminiSchemas.recovery,
                temperature: 0.5,
            });
            return schemas_js_1.recoverySchema.parse(raw);
        }
        catch (err) {
            logger_js_1.logger.warn({ err }, 'recovery fallback');
            return { summary: 'Rotate muscle groups and allow ~48h before training the same group again.', recommendedFocusMuscles: [], musclesToRest: [] };
        }
    }
    async progressAnalysis(uid) {
        const workouts = await aiContextService_js_1.aiContextService.recentWorkouts(uid, 10);
        const prompt = [
            'Analyze the user\'s recent training trend (volume, frequency, consistency) and give brief highlights + suggestions.',
            (0, prompts_js_1.contextBlock)('RECENT_WORKOUTS', workouts),
        ].join('\n\n');
        try {
            const raw = await (0, geminiClient_js_1.generateJson)({
                systemInstruction: prompts_js_1.SAFETY_SYSTEM_PROMPT,
                prompt,
                responseSchema: schemas_js_1.geminiSchemas.progressAnalysis,
                temperature: 0.6,
            });
            return schemas_js_1.progressAnalysisSchema.parse(raw);
        }
        catch (err) {
            logger_js_1.logger.warn({ err }, 'progressAnalysis fallback');
            return {
                summary: workouts.length === 0
                    ? 'No completed workouts yet — log a few to unlock trend analysis.'
                    : 'Keep logging workouts to see richer progress trends.',
                highlights: [],
                suggestions: [],
            };
        }
    }
    /** Free-form chat with the user's compact context. Returns plain text. */
    async chat(uid, message, history = []) {
        const [user, workouts, nutrition] = await Promise.all([
            aiContextService_js_1.aiContextService.userContext(uid),
            aiContextService_js_1.aiContextService.recentWorkouts(uid, 3),
            aiContextService_js_1.aiContextService.todayNutrition(uid, todayKey()),
        ]);
        const historyText = history
            .slice(-6)
            .map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.text}`)
            .join('\n');
        const prompt = [
            (0, prompts_js_1.contextBlock)('USER', user),
            (0, prompts_js_1.contextBlock)('RECENT_WORKOUTS', workouts),
            (0, prompts_js_1.contextBlock)('TODAY_NUTRITION', nutrition),
            historyText ? `CONVERSATION SO FAR:\n${historyText}` : '',
            `User: ${message}`,
            'Reply helpfully and concisely as their coach.',
        ]
            .filter(Boolean)
            .join('\n\n');
        return (0, geminiClient_js_1.generateText)({ systemInstruction: prompts_js_1.SAFETY_SYSTEM_PROMPT, prompt, temperature: 0.85 });
    }
}
exports.AiService = AiService;
exports.aiService = new AiService();
//# sourceMappingURL=aiService.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyPlanService = exports.DailyPlanService = void 0;
const dailyPlanRepository_js_1 = require("../repositories/dailyPlanRepository.js");
const aiService_js_1 = require("./aiService.js");
const exerciseService_js_1 = require("./exerciseService.js");
function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
        .getDate()
        .toString()
        .padStart(2, '0')}`;
}
/**
 * The single source of truth for a user's "today's workout".
 *
 * Both the Plans screen and the AI Chat go through this service, so they always
 * reflect the same persisted structured plan. Exercise selection reuses the
 * existing AI recommendation engine (which validates exercise ids), and muscle
 * groups are derived from the chosen exercises via the exercise library so the
 * stored plan is trustworthy and renderable without the AI.
 */
class DailyPlanService {
    /** Derives distinct primary muscle groups from the plan's exercises. */
    async deriveMuscleGroups(exerciseIds) {
        const muscles = new Set();
        for (const id of exerciseIds) {
            try {
                const ex = await exerciseService_js_1.exerciseService.getById(id);
                if (ex.primaryMuscle)
                    muscles.add(ex.primaryMuscle);
            }
            catch {
                // Skip ids that can't be resolved (keepValidExerciseIds already filters,
                // but be defensive).
            }
        }
        return [...muscles];
    }
    async toStructuredPlan(rec, source, overrideMuscles) {
        const exercises = rec.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            sets: e.sets,
            repMin: e.repMin,
            repMax: e.repMax,
            restSeconds: e.restSeconds,
            reason: e.reason ?? '',
        }));
        const muscleGroups = overrideMuscles ?? (await this.deriveMuscleGroups(exercises.map((e) => e.exerciseId)));
        return {
            title: rec.title,
            goal: rec.goal,
            durationMinutes: rec.durationMinutes,
            muscleGroups,
            exercises,
            notes: rec.notes ?? '',
            source,
        };
    }
    /** Returns today's (or the given date's) plan, generating + persisting once if absent. */
    async getOrCreate(uid, dateKey = todayKey(), opts = {}) {
        const existing = await dailyPlanRepository_js_1.dailyPlanRepository.get(uid, dateKey);
        if (existing)
            return existing;
        const rec = await aiService_js_1.aiService.workoutRecommendation({
            uid,
            location: opts.location,
            muscle: opts.muscle,
            durationMinutes: opts.durationMinutes,
        });
        const plan = await this.toStructuredPlan(rec, 'ai');
        return dailyPlanRepository_js_1.dailyPlanRepository.set(uid, dateKey, { ...plan });
    }
    async get(uid, dateKey = todayKey()) {
        return dailyPlanRepository_js_1.dailyPlanRepository.get(uid, dateKey);
    }
    /** Explicit generate (optionally forcing a fresh plan over an existing one). */
    async generate(uid, input) {
        const dateKey = input.date ?? todayKey();
        if (!input.force) {
            const existing = await dailyPlanRepository_js_1.dailyPlanRepository.get(uid, dateKey);
            if (existing)
                return existing;
        }
        const rec = await aiService_js_1.aiService.workoutRecommendation({
            uid,
            location: input.location,
            muscle: input.muscle,
            durationMinutes: input.durationMinutes,
        });
        const plan = await this.toStructuredPlan(rec, 'ai');
        return dailyPlanRepository_js_1.dailyPlanRepository.set(uid, dateKey, { ...plan });
    }
    /**
     * Updates the persisted plan. If explicit `exercises` are given, saves them as
     * a user-modified plan. Otherwise, if `muscleGroups` are given, regenerates
     * exercises focused on the first target muscle (reusing the AI engine) and
     * persists them as user-modified. The result is the single plan for the date.
     */
    async update(uid, input) {
        const dateKey = input.date ?? todayKey();
        const existing = await dailyPlanRepository_js_1.dailyPlanRepository.get(uid, dateKey);
        if (input.exercises && input.exercises.length > 0) {
            const exercises = input.exercises.map((e) => ({
                exerciseId: e.exerciseId,
                sets: e.sets,
                repMin: e.repMin,
                repMax: e.repMax,
                restSeconds: e.restSeconds,
                reason: e.reason ?? '',
            }));
            const muscleGroups = input.muscleGroups ?? (await this.deriveMuscleGroups(exercises.map((e) => e.exerciseId)));
            const plan = {
                title: input.title ?? existing?.title ?? 'Today\'s workout',
                goal: input.goal ?? existing?.goal ?? '',
                durationMinutes: input.durationMinutes ?? existing?.durationMinutes ?? 45,
                muscleGroups,
                exercises,
                notes: input.notes ?? existing?.notes ?? '',
                source: 'user_modified',
            };
            return dailyPlanRepository_js_1.dailyPlanRepository.set(uid, dateKey, { ...plan });
        }
        // Regenerate for the requested muscle focus.
        const focus = input.muscleGroups?.[0];
        const rec = await aiService_js_1.aiService.workoutRecommendation({
            uid,
            location: input.location,
            muscle: focus,
            durationMinutes: input.durationMinutes,
        });
        // Preserve the user's requested muscle groups as the plan's declared target.
        const plan = await this.toStructuredPlan(rec, 'user_modified', input.muscleGroups);
        return dailyPlanRepository_js_1.dailyPlanRepository.set(uid, dateKey, { ...plan });
    }
    /**
     * Compact text summary of today's plan for the Chat context, so Chat
     * references the SAME persisted plan instead of inventing its own.
     */
    async summarizeForChat(uid, dateKey = todayKey()) {
        const plan = await dailyPlanRepository_js_1.dailyPlanRepository.get(uid, dateKey);
        if (!plan)
            return null;
        const muscles = plan.muscleGroups?.join(', ') || 'full body';
        const exercises = plan.exercises ?? [];
        const names = [];
        for (const e of exercises.slice(0, 12)) {
            try {
                const lib = await exerciseService_js_1.exerciseService.getById(e.exerciseId);
                names.push(`${lib.name} ${e.sets}x${e.repMin}-${e.repMax}`);
            }
            catch {
                names.push(`${e.exerciseId} ${e.sets}x${e.repMin}-${e.repMax}`);
            }
        }
        return [
            `title: ${plan.title ?? "Today's workout"}`,
            `muscleGroups: ${muscles}`,
            `durationMinutes: ${plan.durationMinutes ?? 45}`,
            `source: ${plan.source ?? 'ai'}`,
            `exercises: ${names.join('; ')}`,
        ].join('\n');
    }
}
exports.DailyPlanService = DailyPlanService;
exports.dailyPlanService = new DailyPlanService();
//# sourceMappingURL=dailyPlanService.js.map
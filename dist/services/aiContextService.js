"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiContextService = exports.AiContextService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const profileRepository_js_1 = require("../repositories/profileRepository.js");
const exerciseService_js_1 = require("./exerciseService.js");
/**
 * Builds a COMPACT, privacy-conscious context for AI requests. Never sends the
 * whole database — only the fields relevant to the current recommendation.
 */
class AiContextService {
    /** Compact user profile subset. */
    async userContext(uid) {
        const profile = await profileRepository_js_1.profileRepository.get(uid);
        if (!profile)
            return {};
        return {
            goals: profile.goals ?? [],
            fitnessLevel: profile.fitnessLevel ?? 'beginner',
            ageYears: profile.ageYears ?? null,
            heightCm: profile.heightCm ?? null,
            weightKg: profile.weightKg ?? null,
            activityLevel: profile.activityLevel ?? 'moderate',
            workoutLocation: profile.workoutLocation ?? 'both',
            equipment: profile.equipment ?? [],
            targets: profile.targets ?? null,
        };
    }
    /** Recent completed workouts summarized (no raw set-by-set noise). */
    async recentWorkouts(uid, limit = 6) {
        const snap = await (0, firebase_js_1.getFirestore)()
            .collection('users')
            .doc(uid)
            .collection('workouts')
            .where('status', '==', 'completed')
            .get();
        const rows = snap.docs
            .map((d) => d.data())
            .sort((a, b) => tsMillis(b.startedAt) - tsMillis(a.startedAt))
            .slice(0, limit);
        return rows.map((w) => ({
            name: w.name,
            date: toIso(w.startedAt),
            muscleGroups: w.muscleGroups ?? [],
            totalVolume: w.totalVolume ?? 0,
            completedSets: w.completedSets ?? 0,
            durationSeconds: w.durationSeconds ?? 0,
        }));
    }
    /** Muscle groups trained recently + last-trained dates (recovery-aware). */
    async muscleRecency(uid) {
        const snap = await (0, firebase_js_1.getFirestore)()
            .collection('users')
            .doc(uid)
            .collection('workouts')
            .where('status', '==', 'completed')
            .get();
        const lastTrained = {};
        for (const d of snap.docs) {
            const w = d.data();
            const date = toIso(w.startedAt);
            if (!date)
                continue;
            for (const m of w.muscleGroups ?? []) {
                if (!lastTrained[m] || lastTrained[m] < date)
                    lastTrained[m] = date;
            }
        }
        return lastTrained;
    }
    /** Today's nutrition totals + water. */
    async todayNutrition(uid, dateKey) {
        const db = (0, firebase_js_1.getFirestore)();
        const [foodSnap, waterSnap] = await Promise.all([
            db.collection('users').doc(uid).collection('foodLogs').where('dateKey', '==', dateKey).get(),
            db.collection('users').doc(uid).collection('waterLogs').where('dateKey', '==', dateKey).get(),
        ]);
        let calories = 0;
        let protein = 0;
        let carbs = 0;
        let fat = 0;
        for (const d of foodSnap.docs) {
            const f = d.data();
            calories += f.calories ?? 0;
            protein += f.protein ?? 0;
            carbs += f.carbs ?? 0;
            fat += f.fat ?? 0;
        }
        let waterMl = 0;
        for (const d of waterSnap.docs) {
            waterMl += d.data().amountMl ?? 0;
        }
        return {
            calories: Math.round(calories),
            protein: Math.round(protein),
            carbs: Math.round(carbs),
            fat: Math.round(fat),
            waterMl,
        };
    }
    /**
     * Candidate exercises the AI may pick from — filtered to the user's
     * equipment/location and (optionally) a target muscle. Returns compact
     * {id,name,primaryMuscle,equipment,type} entries, capped.
     */
    async candidateExercises(params) {
        const { items } = await exerciseService_js_1.exerciseService.list({
            location: params.location ?? 'all',
            muscle: params.muscle ?? 'all',
            limit: 500,
        });
        const userEquip = new Set(params.equipment ?? []);
        const filtered = items.filter((e) => {
            if (userEquip.size === 0)
                return true;
            // Keep exercises whose equipment is a subset of what the user has, or
            // that need no equipment.
            return e.equipment.every((eq) => eq === 'none' || userEquip.has(eq));
        });
        const pool = filtered.length > 0 ? filtered : items;
        return pool.slice(0, params.limit ?? 40).map((e) => ({
            id: e.id,
            name: e.name,
            primaryMuscle: e.primaryMuscle,
            equipment: e.equipment,
            type: e.type,
            difficulty: e.difficulty,
        }));
    }
}
exports.AiContextService = AiContextService;
function tsMillis(value) {
    const t = value;
    return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
}
function toIso(value) {
    const t = value;
    return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}
exports.aiContextService = new AiContextService();
//# sourceMappingURL=aiContextService.js.map
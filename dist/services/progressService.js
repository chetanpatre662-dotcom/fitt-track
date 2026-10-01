"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.progressService = exports.ProgressService = void 0;
const firebase_js_1 = require("../config/firebase.js");
function rangeStart(range) {
    const now = Date.now();
    const day = 86_400_000;
    switch (range) {
        case '7d':
            return new Date(now - 7 * day);
        case '30d':
            return new Date(now - 30 * day);
        case '90d':
            return new Date(now - 90 * day);
        case '1y':
            return new Date(now - 365 * day);
        case 'all':
            return null;
    }
}
/**
 * Aggregates completed-workout data for history & progression views.
 * Reads completed workouts once and computes summaries in-memory (workout
 * counts are modest per user, so this avoids many composite-index queries).
 */
class ProgressService {
    async loadCompleted(uid, start) {
        const col = (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('workouts');
        const q = col.where('status', '==', 'completed');
        const snap = await q.get();
        const out = [];
        for (const d of snap.docs) {
            const data = d.data();
            const started = data.startedAt;
            const startedAt = started && typeof started.toDate === 'function' ? started.toDate() : null;
            if (start && startedAt && startedAt < start)
                continue;
            if (start && !startedAt)
                continue;
            out.push({
                id: d.id,
                name: data.name ?? 'Workout',
                startedAt,
                durationSeconds: data.durationSeconds ?? 0,
                totalVolume: data.totalVolume ?? 0,
                completedSets: data.completedSets ?? 0,
                totalReps: data.totalReps ?? 0,
                muscleGroups: data.muscleGroups ?? [],
                exercises: data.exercises ?? [],
            });
        }
        // Sort by date ascending for series.
        out.sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0));
        return out;
    }
    /** Overall workout summary + per-day series for the range. */
    async workoutSummary(uid, range) {
        const workouts = await this.loadCompleted(uid, rangeStart(range));
        const totalWorkouts = workouts.length;
        const totalVolume = workouts.reduce((s, w) => s + w.totalVolume, 0);
        const totalSets = workouts.reduce((s, w) => s + w.completedSets, 0);
        const totalDuration = workouts.reduce((s, w) => s + w.durationSeconds, 0);
        // Muscle-group frequency.
        const muscleFrequency = {};
        for (const w of workouts) {
            for (const m of w.muscleGroups) {
                muscleFrequency[m] = (muscleFrequency[m] ?? 0) + 1;
            }
        }
        // Per-day volume & count series (yyyy-MM-dd local).
        const byDay = {};
        for (const w of workouts) {
            if (!w.startedAt)
                continue;
            const key = dateKey(w.startedAt);
            byDay[key] ??= { volume: 0, count: 0, durationSeconds: 0 };
            byDay[key].volume += w.totalVolume;
            byDay[key].count += 1;
            byDay[key].durationSeconds += w.durationSeconds;
        }
        const series = Object.entries(byDay)
            .map(([date, v]) => ({ date, ...v }))
            .sort((a, b) => a.date.localeCompare(b.date));
        return {
            range,
            totalWorkouts,
            totalVolume,
            totalSets,
            totalDurationSeconds: totalDuration,
            averageDurationSeconds: totalWorkouts > 0 ? Math.round(totalDuration / totalWorkouts) : 0,
            muscleFrequency,
            series,
        };
    }
    /** Progression for a single exercise: per-workout best set over time. */
    async exerciseProgression(uid, exerciseId, range) {
        const workouts = await this.loadCompleted(uid, rangeStart(range));
        const points = [];
        for (const w of workouts) {
            const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
            if (!ex || !w.startedAt)
                continue;
            const done = ex.sets.filter((s) => s.completed);
            if (done.length === 0)
                continue;
            const maxWeightKg = Math.max(...done.map((s) => s.weightKg ?? 0));
            const maxReps = Math.max(...done.map((s) => s.reps ?? 0));
            const volume = done.reduce((sum, s) => {
                const w2 = s.weightKg ?? 0;
                const r = s.reps ?? 0;
                return sum + (w2 > 0 && r > 0 ? w2 * r : 0);
            }, 0);
            points.push({ date: dateKey(w.startedAt), maxWeightKg, maxReps, totalVolume: volume });
        }
        return { exerciseId, range, points };
    }
    /** Recent completed workouts (history list). */
    async history(uid, range, limit = 100) {
        const workouts = await this.loadCompleted(uid, rangeStart(range));
        return workouts
            .slice()
            .reverse()
            .slice(0, limit)
            .map((w) => ({
            id: w.id,
            name: w.name,
            date: w.startedAt ? w.startedAt.toISOString() : null,
            durationSeconds: w.durationSeconds,
            totalVolume: w.totalVolume,
            completedSets: w.completedSets,
            totalReps: w.totalReps,
            muscleGroups: w.muscleGroups,
        }));
    }
}
exports.ProgressService = ProgressService;
function dateKey(d) {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
}
exports.progressService = new ProgressService();
//# sourceMappingURL=progressService.js.map
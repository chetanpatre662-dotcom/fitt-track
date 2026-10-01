"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setVolume = setVolume;
exports.exerciseVolume = exerciseVolume;
exports.computeWorkoutStats = computeWorkoutStats;
exports.canTransition = canTransition;
/** Volume for a single strength set = weight × reps (0 if either missing). */
function setVolume(set) {
    const w = set.weightKg ?? 0;
    const r = set.reps ?? 0;
    if (w <= 0 || r <= 0)
        return 0;
    return w * r;
}
/** Total volume across only COMPLETED sets of an exercise. */
function exerciseVolume(sets) {
    return sets.filter((s) => s.completed).reduce((sum, s) => sum + setVolume(s), 0);
}
function computeWorkoutStats(exercises) {
    let totalVolume = 0;
    let totalSets = 0;
    let completedSets = 0;
    let totalReps = 0;
    const muscles = new Set();
    for (const ex of exercises) {
        if (ex.primaryMuscle)
            muscles.add(ex.primaryMuscle);
        for (const s of ex.sets) {
            totalSets += 1;
            if (s.completed) {
                completedSets += 1;
                totalVolume += setVolume(s);
                totalReps += s.reps ?? 0;
            }
        }
    }
    return {
        totalVolume: Math.round(totalVolume),
        totalSets,
        completedSets,
        totalReps,
        muscleGroups: Array.from(muscles),
    };
}
/**
 * Valid workout status transitions. Returns true if `to` is reachable from
 * `from`. Used to guard start/pause/resume/finish/cancel.
 */
const TRANSITIONS = {
    planned: ['in_progress', 'cancelled'],
    in_progress: ['paused', 'completed', 'cancelled'],
    paused: ['in_progress', 'completed', 'cancelled'],
    completed: [], // terminal
    cancelled: [], // terminal
};
function canTransition(from, to) {
    return TRANSITIONS[from]?.includes(to) ?? false;
}
//# sourceMappingURL=workoutCalc.js.map
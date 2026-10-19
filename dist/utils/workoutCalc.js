"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setReps = setReps;
exports.topStageOf = topStageOf;
exports.setVolume = setVolume;
exports.exerciseVolume = exerciseVolume;
exports.computeWorkoutStats = computeWorkoutStats;
exports.canTransition = canTransition;
/**
 * True only when a set is a drop set WITH at least one stage. A `drop` flag
 * carrying zero stages degrades to a normal set (uses its top-level values),
 * and a `normal` set carrying stray stages is NOT treated as a drop set.
 */
function isDropWithStages(set) {
    return set.setType === 'drop' && Array.isArray(set.dropStages) && set.dropStages.length > 0;
}
/** Drop-aware total reps of a single set, irrespective of completion. */
function setReps(set) {
    if (isDropWithStages(set)) {
        return set.dropStages.reduce((sum, st) => sum + (st.reps ?? 0), 0);
    }
    return set.reps ?? 0;
}
/**
 * The PR-relevant (top) weight/reps pair of a set. For a drop set this is the
 * FIRST (heaviest) stage; otherwise the set's own top-level values.
 */
function topStageOf(set) {
    if (isDropWithStages(set)) {
        const top = set.dropStages[0];
        return { weightKg: top.weightKg ?? null, reps: top.reps ?? null };
    }
    return { weightKg: set.weightKg ?? null, reps: set.reps ?? null };
}
/**
 * Volume for a single strength set = weight × reps (0 if either missing).
 * For a drop set it is the SUM of each stage's weight × reps.
 */
function setVolume(set) {
    if (isDropWithStages(set)) {
        return set.dropStages.reduce((sum, st) => {
            const w = st.weightKg ?? 0;
            const r = st.reps ?? 0;
            return w > 0 && r > 0 ? sum + w * r : sum;
        }, 0);
    }
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
                totalReps += setReps(s);
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
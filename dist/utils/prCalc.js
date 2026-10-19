"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bestSetForWorkout = bestSetForWorkout;
exports.derivePrCandidates = derivePrCandidates;
exports.isNewRecord = isNewRecord;
const workoutCalc_js_1 = require("./workoutCalc.js");
/**
 * Returns the heaviest VALID (completed, positive weight+reps) set of a
 * workout, carrying the ACTUAL reps performed on that set — never an inferred,
 * defaulted, or max-of-any-set reps value. This is the §3 root-cause fix for
 * progression: it replaces the previous two independent Math.max over weight
 * and reps, which could pair a top-set weight with a warm-up's reps.
 *
 * Rules IN ORDER:
 *   1. Keep a set only if completed && weightKg>0 && reps>0; none -> null.
 *   2. weightKg = greatest weightKg among valid sets.
 *   3. reps = the actual reps of that max-weight set.
 *   4. Tie-break at equal max weight = the set with the highest actual reps.
 *   5. estimated1Rm = Epley at 1 decimal, only when reps<=30 (else null).
 *   6. volume = sum of weightKg*reps over all valid sets.
 */
function bestSetForWorkout(sets) {
    // The PR-relevant weight/reps pair of each set is its TOP stage (stage 0 for
    // a drop set, the top-level values otherwise) — never a lighter drop stage.
    const valid = sets.filter((s) => {
        if (s.completed !== true)
            return false;
        const top = (0, workoutCalc_js_1.topStageOf)(s);
        return top.weightKg != null && top.weightKg > 0 && top.reps != null && top.reps > 0;
    });
    if (valid.length === 0)
        return null;
    let best = valid[0];
    let bestPair = (0, workoutCalc_js_1.topStageOf)(best);
    for (const s of valid) {
        const pair = (0, workoutCalc_js_1.topStageOf)(s);
        const w = pair.weightKg;
        const r = pair.reps;
        const bw = bestPair.weightKg;
        const br = bestPair.reps;
        if (w > bw || (w === bw && r > br)) {
            best = s;
            bestPair = pair;
        }
    }
    const weightKg = bestPair.weightKg;
    const reps = bestPair.reps;
    // Volume is the drop-aware total (sum of stages for a drop set) so it matches
    // the aggregate totalVolume and the progression hint.
    const volume = valid.reduce((sum, s) => sum + (0, workoutCalc_js_1.setVolume)(s), 0);
    const estimated1Rm = reps <= 30 ? Math.round(weightKg * (1 + reps / 30) * 10) / 10 : null;
    return { weightKg, reps, volume, estimated1Rm };
}
/**
 * Derives the best PR candidates for each exercise from its COMPLETED sets.
 * Strength exercises produce max_weight / max_reps / max_volume candidates.
 * Cardio (distance/duration) sets produce best_distance / best_time.
 *
 * Only completed sets are considered. Returns at most a few candidates per
 * exercise (the best of each applicable type within this workout).
 */
function derivePrCandidates(exercises) {
    const out = [];
    for (const ex of exercises) {
        const done = ex.sets.filter((s) => s.completed);
        if (done.length === 0)
            continue;
        // Strength candidates. The weight/reps pair comes from each set's TOP
        // stage (drop-aware) so lighter drop stages never create a spurious PR.
        const maxWeightSet = bestBy(done, (s) => (0, workoutCalc_js_1.topStageOf)(s).weightKg ?? 0);
        if (maxWeightSet && ((0, workoutCalc_js_1.topStageOf)(maxWeightSet).weightKg ?? 0) > 0) {
            const top = (0, workoutCalc_js_1.topStageOf)(maxWeightSet);
            out.push({
                exerciseId: ex.exerciseId,
                recordType: 'max_weight',
                value: top.weightKg,
                reps: top.reps,
                weightKg: top.weightKg,
            });
        }
        const maxRepsSet = bestBy(done, (s) => (0, workoutCalc_js_1.topStageOf)(s).reps ?? 0);
        if (maxRepsSet && ((0, workoutCalc_js_1.topStageOf)(maxRepsSet).reps ?? 0) > 0) {
            const top = (0, workoutCalc_js_1.topStageOf)(maxRepsSet);
            out.push({
                exerciseId: ex.exerciseId,
                recordType: 'max_reps',
                value: top.reps,
                reps: top.reps,
                weightKg: top.weightKg,
            });
        }
        // Volume PR rewards the whole set, so a drop set uses its stage-sum volume.
        const maxVolumeSet = bestBy(done, (s) => (0, workoutCalc_js_1.setVolume)(s));
        const maxVol = maxVolumeSet ? (0, workoutCalc_js_1.setVolume)(maxVolumeSet) : 0;
        if (maxVol > 0) {
            const top = maxVolumeSet ? (0, workoutCalc_js_1.topStageOf)(maxVolumeSet) : { weightKg: null, reps: null };
            out.push({
                exerciseId: ex.exerciseId,
                recordType: 'max_volume',
                value: maxVol,
                reps: top.reps,
                weightKg: top.weightKg,
            });
        }
        // Cardio candidates.
        const bestDistanceSet = bestBy(done, (s) => s.distanceM ?? 0);
        if (bestDistanceSet && (bestDistanceSet.distanceM ?? 0) > 0) {
            out.push({
                exerciseId: ex.exerciseId,
                recordType: 'best_distance',
                value: bestDistanceSet.distanceM,
            });
        }
        const bestTimeSet = bestBy(done, (s) => s.durationSeconds ?? 0);
        if (bestTimeSet && (bestTimeSet.durationSeconds ?? 0) > 0) {
            out.push({
                exerciseId: ex.exerciseId,
                recordType: 'best_time',
                value: bestTimeSet.durationSeconds,
            });
        }
    }
    return out;
}
function bestBy(sets, score) {
    let best = null;
    let bestScore = -Infinity;
    for (const s of sets) {
        const v = score(s);
        if (v > bestScore) {
            bestScore = v;
            best = s;
        }
    }
    return best;
}
/**
 * Given a candidate and the previous best value, returns true if the candidate
 * is a NEW record (strictly greater). For best_time we treat larger as better
 * (e.g. longest plank / longest run duration); pace-based improvements are out
 * of scope for this heuristic.
 */
function isNewRecord(candidateValue, previousBest) {
    if (previousBest === null || previousBest === undefined)
        return candidateValue > 0;
    return candidateValue > previousBest;
}
//# sourceMappingURL=prCalc.js.map
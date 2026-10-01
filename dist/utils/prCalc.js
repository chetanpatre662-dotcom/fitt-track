"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.derivePrCandidates = derivePrCandidates;
exports.isNewRecord = isNewRecord;
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
        // Strength candidates.
        const maxWeightSet = bestBy(done, (s) => s.weightKg ?? 0);
        if (maxWeightSet && (maxWeightSet.weightKg ?? 0) > 0) {
            out.push({
                exerciseId: ex.exerciseId,
                recordType: 'max_weight',
                value: maxWeightSet.weightKg,
                reps: maxWeightSet.reps ?? null,
                weightKg: maxWeightSet.weightKg ?? null,
            });
        }
        const maxRepsSet = bestBy(done, (s) => s.reps ?? 0);
        if (maxRepsSet && (maxRepsSet.reps ?? 0) > 0) {
            out.push({
                exerciseId: ex.exerciseId,
                recordType: 'max_reps',
                value: maxRepsSet.reps,
                reps: maxRepsSet.reps ?? null,
                weightKg: maxRepsSet.weightKg ?? null,
            });
        }
        const maxVolumeSet = bestBy(done, (s) => setVol(s));
        const maxVol = maxVolumeSet ? setVol(maxVolumeSet) : 0;
        if (maxVol > 0) {
            out.push({
                exerciseId: ex.exerciseId,
                recordType: 'max_volume',
                value: maxVol,
                reps: maxVolumeSet?.reps ?? null,
                weightKg: maxVolumeSet?.weightKg ?? null,
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
function setVol(s) {
    const w = s.weightKg ?? 0;
    const r = s.reps ?? 0;
    return w > 0 && r > 0 ? w * r : 0;
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
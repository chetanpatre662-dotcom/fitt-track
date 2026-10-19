import type { PrType } from '../models/domain.js';
import type { WorkoutExerciseData, WorkoutSetData } from './workoutCalc.js';
import { setVolume, topStageOf } from './workoutCalc.js';

/** A candidate personal-record value derived from a workout's completed sets. */
export interface PrCandidate {
  exerciseId: string;
  recordType: PrType;
  value: number;
  reps?: number | null;
  weightKg?: number | null;
}

/**
 * The single best (heaviest) set of a workout, carrying its OWN reps so the
 * weight/reps pair always co-occurred on one real set. Used for the
 * previous-performance / progression hint (§3 fix).
 */
export interface BestSet {
  weightKg: number;
  reps: number;
  volume: number;
  /** Epley estimate (weightKg*(1+reps/30)) at 1 decimal; null when reps>30. */
  estimated1Rm: number | null;
}

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
export function bestSetForWorkout(sets: WorkoutSetData[]): BestSet | null {
  // The PR-relevant weight/reps pair of each set is its TOP stage (stage 0 for
  // a drop set, the top-level values otherwise) — never a lighter drop stage.
  const valid = sets.filter((s) => {
    if (s.completed !== true) return false;
    const top = topStageOf(s);
    return top.weightKg != null && top.weightKg > 0 && top.reps != null && top.reps > 0;
  });
  if (valid.length === 0) return null;

  let best = valid[0];
  let bestPair = topStageOf(best);
  for (const s of valid) {
    const pair = topStageOf(s);
    const w = pair.weightKg as number;
    const r = pair.reps as number;
    const bw = bestPair.weightKg as number;
    const br = bestPair.reps as number;
    if (w > bw || (w === bw && r > br)) {
      best = s;
      bestPair = pair;
    }
  }

  const weightKg = bestPair.weightKg as number;
  const reps = bestPair.reps as number;
  // Volume is the drop-aware total (sum of stages for a drop set) so it matches
  // the aggregate totalVolume and the progression hint.
  const volume = valid.reduce((sum, s) => sum + setVolume(s), 0);
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
export function derivePrCandidates(exercises: WorkoutExerciseData[]): PrCandidate[] {
  const out: PrCandidate[] = [];

  for (const ex of exercises) {
    const done = ex.sets.filter((s) => s.completed);
    if (done.length === 0) continue;

    // Strength candidates. The weight/reps pair comes from each set's TOP
    // stage (drop-aware) so lighter drop stages never create a spurious PR.
    const maxWeightSet = bestBy(done, (s) => topStageOf(s).weightKg ?? 0);
    if (maxWeightSet && (topStageOf(maxWeightSet).weightKg ?? 0) > 0) {
      const top = topStageOf(maxWeightSet);
      out.push({
        exerciseId: ex.exerciseId,
        recordType: 'max_weight',
        value: top.weightKg as number,
        reps: top.reps,
        weightKg: top.weightKg,
      });
    }

    const maxRepsSet = bestBy(done, (s) => topStageOf(s).reps ?? 0);
    if (maxRepsSet && (topStageOf(maxRepsSet).reps ?? 0) > 0) {
      const top = topStageOf(maxRepsSet);
      out.push({
        exerciseId: ex.exerciseId,
        recordType: 'max_reps',
        value: top.reps as number,
        reps: top.reps,
        weightKg: top.weightKg,
      });
    }

    // Volume PR rewards the whole set, so a drop set uses its stage-sum volume.
    const maxVolumeSet = bestBy(done, (s) => setVolume(s));
    const maxVol = maxVolumeSet ? setVolume(maxVolumeSet) : 0;
    if (maxVol > 0) {
      const top = maxVolumeSet ? topStageOf(maxVolumeSet) : { weightKg: null, reps: null };
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
        value: bestDistanceSet.distanceM as number,
      });
    }

    const bestTimeSet = bestBy(done, (s) => s.durationSeconds ?? 0);
    if (bestTimeSet && (bestTimeSet.durationSeconds ?? 0) > 0) {
      out.push({
        exerciseId: ex.exerciseId,
        recordType: 'best_time',
        value: bestTimeSet.durationSeconds as number,
      });
    }
  }

  return out;
}

function bestBy(sets: WorkoutSetData[], score: (s: WorkoutSetData) => number): WorkoutSetData | null {
  let best: WorkoutSetData | null = null;
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
export function isNewRecord(candidateValue: number, previousBest: number | null): boolean {
  if (previousBest === null || previousBest === undefined) return candidateValue > 0;
  return candidateValue > previousBest;
}

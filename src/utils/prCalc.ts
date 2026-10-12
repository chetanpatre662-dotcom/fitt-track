import type { PrType } from '../models/domain.js';
import type { WorkoutExerciseData, WorkoutSetData } from './workoutCalc.js';

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
  const valid = sets.filter(
    (s) =>
      s.completed === true &&
      s.weightKg != null &&
      s.weightKg > 0 &&
      s.reps != null &&
      s.reps > 0,
  );
  if (valid.length === 0) return null;

  let best = valid[0];
  for (const s of valid) {
    const w = s.weightKg as number;
    const r = s.reps as number;
    const bw = best.weightKg as number;
    const br = best.reps as number;
    if (w > bw || (w === bw && r > br)) {
      best = s;
    }
  }

  const weightKg = best.weightKg as number;
  const reps = best.reps as number;
  const volume = valid.reduce((sum, s) => sum + (s.weightKg as number) * (s.reps as number), 0);
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

    // Strength candidates.
    const maxWeightSet = bestBy(done, (s) => s.weightKg ?? 0);
    if (maxWeightSet && (maxWeightSet.weightKg ?? 0) > 0) {
      out.push({
        exerciseId: ex.exerciseId,
        recordType: 'max_weight',
        value: maxWeightSet.weightKg as number,
        reps: maxWeightSet.reps ?? null,
        weightKg: maxWeightSet.weightKg ?? null,
      });
    }

    const maxRepsSet = bestBy(done, (s) => s.reps ?? 0);
    if (maxRepsSet && (maxRepsSet.reps ?? 0) > 0) {
      out.push({
        exerciseId: ex.exerciseId,
        recordType: 'max_reps',
        value: maxRepsSet.reps as number,
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

function setVol(s: WorkoutSetData): number {
  const w = s.weightKg ?? 0;
  const r = s.reps ?? 0;
  return w > 0 && r > 0 ? w * r : 0;
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

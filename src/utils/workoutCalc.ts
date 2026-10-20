import type { MuscleGroup } from '../models/domain.js';

/** One stage of a drop set: a weight/reps pair performed without rest. */
export interface DropStageData {
  weightKg?: number | null;
  reps?: number | null;
  /** Independent per-side values for a unilateral set (additive/optional). */
  leftWeightKg?: number | null;
  rightWeightKg?: number | null;
  leftReps?: number | null;
  rightReps?: number | null;
}

/** A single set as stored/submitted. */
export interface WorkoutSetData {
  setNumber: number;
  weightKg?: number | null;
  reps?: number | null;
  distanceM?: number | null;
  durationSeconds?: number | null;
  calories?: number | null;
  completed: boolean;
  /** 'normal' (default) or 'drop'. Legacy sets have neither and are normal. */
  setType?: 'normal' | 'drop' | null;
  /** Drop-set stages; present (non-empty) only when setType === 'drop'. */
  dropStages?: DropStageData[] | null;
  /**
   * Independent per-side values for a unilateral set (additive/optional). When
   * ANY of these is non-null the set is unilateral and the top-level
   * weightKg/reps are ignored by volume/reps/PR. leftCompleted/rightCompleted
   * track per-side completion.
   */
  leftWeightKg?: number | null;
  rightWeightKg?: number | null;
  leftReps?: number | null;
  rightReps?: number | null;
  leftCompleted?: boolean | null;
  rightCompleted?: boolean | null;
}

/**
 * True when a set carries any independent left/right value — i.e. it is a
 * unilateral set whose top-level weightKg/reps must be ignored. Mirrors
 * ExerciseSet.isUnilateralSet in frontend workout.dart.
 */
export function isUnilateralSet(set: WorkoutSetData): boolean {
  return (
    set.leftWeightKg != null ||
    set.rightWeightKg != null ||
    set.leftReps != null ||
    set.rightReps != null ||
    set.leftCompleted != null ||
    set.rightCompleted != null
  );
}

/** One side's weight×reps, counted only when BOTH are positive. */
function sideVolume(w?: number | null, r?: number | null): number {
  const ww = w ?? 0;
  const rr = r ?? 0;
  return ww > 0 && rr > 0 ? ww * rr : 0;
}

/** One side's reps, counted only when the side has a positive weight×reps. */
function sideReps(w?: number | null, r?: number | null): number {
  const ww = w ?? 0;
  const rr = r ?? 0;
  return ww > 0 && rr > 0 ? rr : 0;
}

/**
 * The PR-relevant (weight, reps) pair for a unilateral stage: the HEAVIER side.
 * Ties on weight break to the side with more reps; a single positive side wins;
 * null/<=0 sides are ignored; neither positive -> {null, null}.
 */
function unilateralTopOf(
  leftWeightKg?: number | null,
  leftReps?: number | null,
  rightWeightKg?: number | null,
  rightReps?: number | null,
): { weightKg: number | null; reps: number | null } {
  const lw = leftWeightKg ?? 0;
  const lr = leftReps ?? 0;
  const rw = rightWeightKg ?? 0;
  const rr = rightReps ?? 0;
  const leftOk = lw > 0 && lr > 0;
  const rightOk = rw > 0 && rr > 0;
  if (!leftOk && !rightOk) return { weightKg: null, reps: null };
  if (leftOk && !rightOk) return { weightKg: lw, reps: lr };
  if (rightOk && !leftOk) return { weightKg: rw, reps: rr };
  // Both sides positive: pick the heavier; tie -> more reps.
  if (lw > rw || (lw === rw && lr >= rr)) return { weightKg: lw, reps: lr };
  return { weightKg: rw, reps: rr };
}

/**
 * True only when a set is a drop set WITH at least one stage. A `drop` flag
 * carrying zero stages degrades to a normal set (uses its top-level values),
 * and a `normal` set carrying stray stages is NOT treated as a drop set.
 */
function isDropWithStages(set: WorkoutSetData): boolean {
  return set.setType === 'drop' && Array.isArray(set.dropStages) && set.dropStages.length > 0;
}

/**
 * Drop-aware total reps of a single set, irrespective of completion. For a
 * unilateral set this sums both sides' reps (a side counts only when its own
 * weight×reps is positive, matching the volume convention).
 */
export function setReps(set: WorkoutSetData): number {
  if (isUnilateralSet(set)) {
    if (isDropWithStages(set)) {
      return (set.dropStages as DropStageData[]).reduce(
        (sum, st) => sum + sideReps(st.leftWeightKg, st.leftReps) + sideReps(st.rightWeightKg, st.rightReps),
        0,
      );
    }
    return sideReps(set.leftWeightKg, set.leftReps) + sideReps(set.rightWeightKg, set.rightReps);
  }
  if (isDropWithStages(set)) {
    return (set.dropStages as DropStageData[]).reduce((sum, st) => sum + (st.reps ?? 0), 0);
  }
  return set.reps ?? 0;
}

/**
 * The PR-relevant (top) weight/reps pair of a set. For a drop set this is the
 * FIRST (heaviest) stage; otherwise the set's own top-level values. For a
 * unilateral set the pair is the HEAVIER side of that top stage.
 */
export function topStageOf(set: WorkoutSetData): { weightKg: number | null; reps: number | null } {
  if (isUnilateralSet(set)) {
    if (isDropWithStages(set)) {
      const top = (set.dropStages as DropStageData[])[0];
      return unilateralTopOf(top.leftWeightKg, top.leftReps, top.rightWeightKg, top.rightReps);
    }
    return unilateralTopOf(set.leftWeightKg, set.leftReps, set.rightWeightKg, set.rightReps);
  }
  if (isDropWithStages(set)) {
    const top = (set.dropStages as DropStageData[])[0];
    return { weightKg: top.weightKg ?? null, reps: top.reps ?? null };
  }
  return { weightKg: set.weightKg ?? null, reps: set.reps ?? null };
}

export interface WorkoutExerciseData {
  exerciseId: string;
  order: number;
  notes?: string | null;
  primaryMuscle?: MuscleGroup;
  sets: WorkoutSetData[];
}

/**
 * Volume for a single strength set = weight × reps (0 if either missing).
 * For a drop set it is the SUM of each stage's weight × reps.
 */
export function setVolume(set: WorkoutSetData): number {
  if (isUnilateralSet(set)) {
    // Unilateral: sum both sides (each counted only when both its operands are
    // positive); top-level weightKg/reps are ignored. No double-count.
    if (isDropWithStages(set)) {
      return (set.dropStages as DropStageData[]).reduce(
        (sum, st) => sum + sideVolume(st.leftWeightKg, st.leftReps) + sideVolume(st.rightWeightKg, st.rightReps),
        0,
      );
    }
    return sideVolume(set.leftWeightKg, set.leftReps) + sideVolume(set.rightWeightKg, set.rightReps);
  }
  if (isDropWithStages(set)) {
    return (set.dropStages as DropStageData[]).reduce((sum, st) => {
      const w = st.weightKg ?? 0;
      const r = st.reps ?? 0;
      return w > 0 && r > 0 ? sum + w * r : sum;
    }, 0);
  }
  const w = set.weightKg ?? 0;
  const r = set.reps ?? 0;
  if (w <= 0 || r <= 0) return 0;
  return w * r;
}

/**
 * Whether a set counts toward completedSets. A bilateral set counts when its
 * own `completed` flag is true. A unilateral set counts as ONE set only when
 * BOTH sides are completed.
 */
export function isSetCompleted(set: WorkoutSetData): boolean {
  if (isUnilateralSet(set)) {
    return set.leftCompleted === true && set.rightCompleted === true;
  }
  return set.completed === true;
}

/**
 * Volume that should count toward the workout total for a set. For a bilateral
 * set this is its full volume (the caller gates on `completed`). For a
 * unilateral set each side's contribution counts ONLY when that side is
 * completed, so a one-side-completed set still contributes that side.
 */
export function completedVolume(set: WorkoutSetData): number {
  if (!isUnilateralSet(set)) return set.completed ? setVolume(set) : 0;
  if (isDropWithStages(set)) {
    const left = set.leftCompleted === true
      ? (set.dropStages as DropStageData[]).reduce((s, st) => s + sideVolume(st.leftWeightKg, st.leftReps), 0)
      : 0;
    const right = set.rightCompleted === true
      ? (set.dropStages as DropStageData[]).reduce((s, st) => s + sideVolume(st.rightWeightKg, st.rightReps), 0)
      : 0;
    return left + right;
  }
  const left = set.leftCompleted === true ? sideVolume(set.leftWeightKg, set.leftReps) : 0;
  const right = set.rightCompleted === true ? sideVolume(set.rightWeightKg, set.rightReps) : 0;
  return left + right;
}

/** Reps that count toward the workout total — per-side gated for unilateral. */
export function completedReps(set: WorkoutSetData): number {
  if (!isUnilateralSet(set)) return set.completed ? setReps(set) : 0;
  if (isDropWithStages(set)) {
    const left = set.leftCompleted === true
      ? (set.dropStages as DropStageData[]).reduce((s, st) => s + sideReps(st.leftWeightKg, st.leftReps), 0)
      : 0;
    const right = set.rightCompleted === true
      ? (set.dropStages as DropStageData[]).reduce((s, st) => s + sideReps(st.rightWeightKg, st.rightReps), 0)
      : 0;
    return left + right;
  }
  const left = set.leftCompleted === true ? sideReps(set.leftWeightKg, set.leftReps) : 0;
  const right = set.rightCompleted === true ? sideReps(set.rightWeightKg, set.rightReps) : 0;
  return left + right;
}

/**
 * Total volume across only COMPLETED sets of an exercise. For a unilateral set
 * each side's volume counts only when that side is completed.
 */
export function exerciseVolume(sets: WorkoutSetData[]): number {
  return sets.reduce((sum, s) => sum + completedVolume(s), 0);
}

/** Aggregate stats for a whole workout, counting only completed sets. */
export interface WorkoutStats {
  totalVolume: number;
  totalSets: number;
  completedSets: number;
  totalReps: number;
  muscleGroups: MuscleGroup[];
}

export function computeWorkoutStats(exercises: WorkoutExerciseData[]): WorkoutStats {
  let totalVolume = 0;
  let totalSets = 0;
  let completedSets = 0;
  let totalReps = 0;
  const muscles = new Set<MuscleGroup>();

  for (const ex of exercises) {
    if (ex.primaryMuscle) muscles.add(ex.primaryMuscle);
    for (const s of ex.sets) {
      totalSets += 1;
      // A unilateral set counts as ONE completed set only when BOTH sides are
      // completed; its per-side volume/reps count whenever that side is done
      // (so a one-side-completed set adds volume/reps but not a completed set).
      if (isSetCompleted(s)) completedSets += 1;
      totalVolume += completedVolume(s);
      totalReps += completedReps(s);
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
const TRANSITIONS: Record<string, string[]> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['paused', 'completed', 'cancelled'],
  paused: ['in_progress', 'completed', 'cancelled'],
  completed: [], // terminal
  cancelled: [], // terminal
};

export function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

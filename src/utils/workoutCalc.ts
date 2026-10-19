import type { MuscleGroup } from '../models/domain.js';

/** One stage of a drop set: a weight/reps pair performed without rest. */
export interface DropStageData {
  weightKg?: number | null;
  reps?: number | null;
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
}

/**
 * True only when a set is a drop set WITH at least one stage. A `drop` flag
 * carrying zero stages degrades to a normal set (uses its top-level values),
 * and a `normal` set carrying stray stages is NOT treated as a drop set.
 */
function isDropWithStages(set: WorkoutSetData): boolean {
  return set.setType === 'drop' && Array.isArray(set.dropStages) && set.dropStages.length > 0;
}

/** Drop-aware total reps of a single set, irrespective of completion. */
export function setReps(set: WorkoutSetData): number {
  if (isDropWithStages(set)) {
    return (set.dropStages as DropStageData[]).reduce((sum, st) => sum + (st.reps ?? 0), 0);
  }
  return set.reps ?? 0;
}

/**
 * The PR-relevant (top) weight/reps pair of a set. For a drop set this is the
 * FIRST (heaviest) stage; otherwise the set's own top-level values.
 */
export function topStageOf(set: WorkoutSetData): { weightKg: number | null; reps: number | null } {
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

/** Total volume across only COMPLETED sets of an exercise. */
export function exerciseVolume(sets: WorkoutSetData[]): number {
  return sets.filter((s) => s.completed).reduce((sum, s) => sum + setVolume(s), 0);
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

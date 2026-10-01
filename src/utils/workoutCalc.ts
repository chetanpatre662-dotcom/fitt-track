import type { MuscleGroup } from '../models/domain.js';

/** A single set as stored/submitted. */
export interface WorkoutSetData {
  setNumber: number;
  weightKg?: number | null;
  reps?: number | null;
  distanceM?: number | null;
  durationSeconds?: number | null;
  calories?: number | null;
  completed: boolean;
}

export interface WorkoutExerciseData {
  exerciseId: string;
  order: number;
  notes?: string | null;
  primaryMuscle?: MuscleGroup;
  sets: WorkoutSetData[];
}

/** Volume for a single strength set = weight × reps (0 if either missing). */
export function setVolume(set: WorkoutSetData): number {
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

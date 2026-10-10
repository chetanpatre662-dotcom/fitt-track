import { admin } from '../config/firebase.js';
import { assignedWorkoutRepository } from '../repositories/assignedWorkoutRepository.js';
import { trainerLinkRepository } from '../repositories/trainerLinkRepository.js';

/** A single exercise line in an assigned workout template. */
export interface AssignedWorkoutExerciseInput {
  exerciseId: string;
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeightKg?: number | null;
}

/** The payload a trainer assigns for a scheduled workout. */
export interface AssignWorkoutInput {
  name: string;
  scheduledDate: string;
  exercises: AssignedWorkoutExerciseInput[];
}

/** The resolved assigned-workout item returned to a client. */
export interface ResolvedAssignedWorkout {
  id: string;
  name: string;
  scheduledDate: string | null;
  exercises: AssignedWorkoutExerciseInput[];
  createdAt: string | null;
}

/**
 * Trainer-assigned workout schedules. Each assignment is one item document at
 * assignedWorkouts/{studentUid}/items/{autoId} (Admin-SDK-only). The student's
 * Start Workout opens the EXISTING active-workout logger prefilled from this
 * template; the finish/history/PR save path is reused unchanged on the client.
 *
 * A student only ever receives items assigned by their CURRENT active trainer:
 * reads require an active trainerLink and filter out any item whose trainerId
 * no longer matches, so a prior trainer's assignments never leak after a switch.
 */
export class AssignedWorkoutService {
  /**
   * Creates an assigned-workout item for the student on behalf of `trainerId`.
   * The caller is expected to have already asserted trainer ownership of the
   * student. The shape/limits are validated upstream; no exercise-library
   * existence check is performed at assign time.
   */
  async assignForStudent(
    trainerId: string,
    studentUid: string,
    input: AssignWorkoutInput,
  ): Promise<ResolvedAssignedWorkout> {
    const exercises = input.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      name: ex.name,
      targetSets: ex.targetSets,
      targetReps: ex.targetReps,
      targetWeightKg: typeof ex.targetWeightKg === 'number' ? ex.targetWeightKg : null,
    }));

    const saved = await assignedWorkoutRepository.add(studentUid, {
      trainerId,
      studentUid,
      name: input.name,
      scheduledDate: input.scheduledDate,
      exercises,
    });

    return this.resolve(saved);
  }

  /**
   * Returns the student's assigned workouts, but ONLY when the caller currently
   * has an ACTIVE trainer link, and ONLY the items assigned by that same active
   * trainer (stale items from a prior trainer are ignored). Ordered by
   * scheduledDate (upcoming first) then createdAt. Returns [] when there is no
   * active link.
   */
  async getForStudent(studentUid: string): Promise<ResolvedAssignedWorkout[]> {
    const link = await trainerLinkRepository.get(studentUid);
    if (!link || link.status !== 'active') return [];
    const activeTrainerId = link.trainerId as string | undefined;
    if (!activeTrainerId) return [];

    const items = await assignedWorkoutRepository.list(studentUid);
    const mine = items.filter((item) => item.trainerId === activeTrainerId);

    const resolved = mine.map((item) => this.resolve(item));
    resolved.sort((a, b) => {
      const byDate = (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '');
      if (byDate !== 0) return byDate;
      return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
    });
    return resolved;
  }

  /** Shapes a stored item doc into the client response. */
  private resolve(item: Record<string, unknown>): ResolvedAssignedWorkout {
    const rawExercises = Array.isArray(item.exercises) ? item.exercises : [];
    const exercises: AssignedWorkoutExerciseInput[] = rawExercises.map((raw) => {
      const ex = (raw ?? {}) as Record<string, unknown>;
      return {
        exerciseId: typeof ex.exerciseId === 'string' ? ex.exerciseId : '',
        name: typeof ex.name === 'string' ? ex.name : '',
        targetSets: typeof ex.targetSets === 'number' ? ex.targetSets : 0,
        targetReps: typeof ex.targetReps === 'number' ? ex.targetReps : 0,
        targetWeightKg: typeof ex.targetWeightKg === 'number' ? ex.targetWeightKg : null,
      };
    });

    return {
      id: (item.id as string) ?? '',
      name: (item.name as string) ?? '',
      scheduledDate: (item.scheduledDate as string | undefined) ?? null,
      exercises,
      createdAt: toIso(item.createdAt),
    };
  }
}

function toIso(value: unknown): string | null {
  const t = value as admin.firestore.Timestamp | undefined;
  if (t && typeof t.toDate === 'function') return t.toDate().toISOString();
  if (typeof value === 'string') return value;
  return null;
}

export const assignedWorkoutService = new AssignedWorkoutService();

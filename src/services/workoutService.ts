import { admin } from '../config/firebase.js';
import type { WorkoutStatus } from '../models/domain.js';
import { workoutRepository } from '../repositories/workoutRepository.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import {
  canTransition,
  computeWorkoutStats,
  type WorkoutExerciseData,
} from '../utils/workoutCalc.js';
import { exerciseService } from './exerciseService.js';
import { personalRecordService } from './personalRecordService.js';
import type { WorkoutUpsertInput } from '../validators/workoutValidators.js';

/**
 * Workout business logic: create/update templates & sessions, enforce status
 * transitions, compute derived stats (volume, sets, reps, muscle groups), and
 * duplicate workouts. Exercise `primaryMuscle` is resolved from the validated
 * exercise library so muscle-group tagging is trustworthy (and invalid
 * exerciseIds are rejected).
 */
export class WorkoutService {
  /** Validates exerciseIds against the library and attaches primaryMuscle. */
  private async hydrateExercises(input: WorkoutUpsertInput): Promise<WorkoutExerciseData[]> {
    const result: WorkoutExerciseData[] = [];
    for (const ex of input.exercises) {
      // Throws NotFoundError if the exercise id is invalid.
      const libEx = await exerciseService.getById(ex.exerciseId);
      result.push({
        exerciseId: ex.exerciseId,
        order: ex.order,
        notes: ex.notes ?? null,
        primaryMuscle: libEx.primaryMuscle,
        sets: ex.sets.map((s) => ({
          setNumber: s.setNumber,
          weightKg: s.weightKg ?? null,
          reps: s.reps ?? null,
          distanceM: s.distanceM ?? null,
          durationSeconds: s.durationSeconds ?? null,
          calories: s.calories ?? null,
          completed: s.completed,
        })),
      });
    }
    // Normalize ordering.
    result.sort((a, b) => a.order - b.order);
    return result;
  }

  async create(uid: string, input: WorkoutUpsertInput): Promise<Record<string, unknown>> {
    const exercises = await this.hydrateExercises(input);
    const stats = computeWorkoutStats(exercises);
    const id = workoutRepository.newId(uid);
    const now = admin.firestore.FieldValue.serverTimestamp();

    const data: Record<string, unknown> = {
      name: input.name,
      type: input.type,
      isTemplate: input.isTemplate,
      status: input.isTemplate ? 'planned' : 'planned',
      notes: input.notes ?? null,
      exercises,
      muscleGroups: stats.muscleGroups,
      totalVolume: stats.totalVolume,
      totalSets: stats.totalSets,
      completedSets: stats.completedSets,
      totalReps: stats.totalReps,
      startedAt: null,
      endedAt: null,
      durationSeconds: 0,
      createdAt: now,
    };
    return workoutRepository.set(uid, id, data);
  }

  async get(uid: string, id: string): Promise<Record<string, unknown>> {
    const w = await workoutRepository.get(uid, id);
    if (!w) throw new NotFoundError('Workout not found');
    return w;
  }

  async list(
    uid: string,
    opts: { status?: string; isTemplate?: boolean; limit?: number },
  ): Promise<Record<string, unknown>[]> {
    return workoutRepository.list(uid, opts);
  }

  async update(uid: string, id: string, input: WorkoutUpsertInput): Promise<Record<string, unknown>> {
    const existing = await workoutRepository.get(uid, id);
    if (!existing) throw new NotFoundError('Workout not found');
    if (existing.status === 'completed') {
      // Completed workouts are immutable records (matches AI-safety requirement).
      throw new BadRequestError('Completed workouts cannot be edited.');
    }

    const exercises = await this.hydrateExercises(input);
    const stats = computeWorkoutStats(exercises);

    return workoutRepository.set(uid, id, {
      name: input.name,
      type: input.type,
      isTemplate: input.isTemplate,
      notes: input.notes ?? null,
      exercises,
      muscleGroups: stats.muscleGroups,
      totalVolume: stats.totalVolume,
      totalSets: stats.totalSets,
      completedSets: stats.completedSets,
      totalReps: stats.totalReps,
    });
  }

  /** Applies a status transition, stamping timestamps/duration as appropriate. */
  async transition(uid: string, id: string, to: WorkoutStatus): Promise<Record<string, unknown>> {
    const existing = await workoutRepository.get(uid, id);
    if (!existing) throw new NotFoundError('Workout not found');
    const from = (existing.status as string) ?? 'planned';

    if (from === to) return existing;
    if (!canTransition(from, to)) {
      throw new BadRequestError(`Cannot change workout status from ${from} to ${to}.`);
    }

    const patch: Record<string, unknown> = { status: to };
    const now = admin.firestore.FieldValue.serverTimestamp();

    if (to === 'in_progress' && !existing.startedAt) {
      patch.startedAt = now;
    }
    if (to === 'completed' || to === 'cancelled') {
      patch.endedAt = now;
      // Recompute duration from startedAt if present.
      const started = existing.startedAt as admin.firestore.Timestamp | null | undefined;
      if (started && typeof started.toDate === 'function') {
        patch.durationSeconds = Math.max(0, Math.round((Date.now() - started.toDate().getTime()) / 1000));
      }
    }

    const saved = await workoutRepository.set(uid, id, patch);

    // On completion, detect personal records (best-effort, never blocks).
    if (to === 'completed') {
      const exercises = ((existing.exercises as WorkoutExerciseData[]) ?? []);
      const newPrs = await personalRecordService.detectAndRecord(uid, id, exercises);
      if (newPrs.length > 0) {
        saved.newPersonalRecords = newPrs;
      }
    }

    return saved;
  }

  async delete(uid: string, id: string): Promise<void> {
    const existing = await workoutRepository.get(uid, id);
    if (!existing) throw new NotFoundError('Workout not found');
    await workoutRepository.delete(uid, id);
  }

  /**
   * Duplicates a workout/template into a fresh planned workout. Sets are copied
   * but marked not-completed so the user starts clean; timings reset.
   */
  async duplicate(uid: string, id: string, asTemplate?: boolean): Promise<Record<string, unknown>> {
    const src = await workoutRepository.get(uid, id);
    if (!src) throw new NotFoundError('Workout not found');

    const exercises = ((src.exercises as WorkoutExerciseData[]) ?? []).map((ex) => ({
      ...ex,
      sets: ex.sets.map((s) => ({ ...s, completed: false })),
    }));
    const stats = computeWorkoutStats(exercises);
    const newId = workoutRepository.newId(uid);
    const now = admin.firestore.FieldValue.serverTimestamp();

    return workoutRepository.set(uid, newId, {
      name: `${(src.name as string) ?? 'Workout'} (copy)`,
      type: src.type ?? 'strength',
      isTemplate: asTemplate ?? Boolean(src.isTemplate),
      status: 'planned',
      notes: src.notes ?? null,
      exercises,
      muscleGroups: stats.muscleGroups,
      totalVolume: stats.totalVolume,
      totalSets: stats.totalSets,
      completedSets: stats.completedSets,
      totalReps: stats.totalReps,
      startedAt: null,
      endedAt: null,
      durationSeconds: 0,
      createdAt: now,
    });
  }
}

export const workoutService = new WorkoutService();

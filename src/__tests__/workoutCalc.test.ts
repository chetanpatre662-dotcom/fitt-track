import { describe, it, expect } from 'vitest';
import {
  canTransition,
  computeWorkoutStats,
  exerciseVolume,
  isSetCompleted,
  setReps,
  setVolume,
  topStageOf,
  type WorkoutExerciseData,
  type WorkoutSetData,
} from '../utils/workoutCalc.js';

describe('workoutCalc', () => {
  it('setVolume = weight × reps, 0 when missing', () => {
    expect(setVolume({ setNumber: 1, weightKg: 40, reps: 10, completed: true })).toBe(400);
    expect(setVolume({ setNumber: 1, weightKg: 0, reps: 10, completed: true })).toBe(0);
    expect(setVolume({ setNumber: 1, reps: 10, completed: true })).toBe(0);
    expect(setVolume({ setNumber: 1, weightKg: 50, completed: true })).toBe(0);
  });

  it('exerciseVolume counts only completed sets', () => {
    const sets = [
      { setNumber: 1, weightKg: 40, reps: 10, completed: true }, // 400
      { setNumber: 2, weightKg: 45, reps: 8, completed: true }, // 360
      { setNumber: 3, weightKg: 45, reps: 8, completed: false }, // ignored
    ];
    expect(exerciseVolume(sets)).toBe(760);
  });

  it('computeWorkoutStats aggregates volume, sets, reps, muscles', () => {
    const exercises: WorkoutExerciseData[] = [
      {
        exerciseId: 'bench',
        order: 0,
        primaryMuscle: 'chest',
        sets: [
          { setNumber: 1, weightKg: 60, reps: 10, completed: true }, // 600
          { setNumber: 2, weightKg: 60, reps: 8, completed: true }, // 480
        ],
      },
      {
        exerciseId: 'row',
        order: 1,
        primaryMuscle: 'back',
        sets: [
          { setNumber: 1, weightKg: 50, reps: 10, completed: true }, // 500
          { setNumber: 2, weightKg: 50, reps: 10, completed: false }, // ignored
        ],
      },
    ];
    const stats = computeWorkoutStats(exercises);
    expect(stats.totalVolume).toBe(1580);
    expect(stats.totalSets).toBe(4);
    expect(stats.completedSets).toBe(3);
    expect(stats.totalReps).toBe(28);
    expect(stats.muscleGroups.sort()).toEqual(['back', 'chest']);
  });

  // --- Unilateral (left/right) rules (MEDIUM-1). The SAME fixtures are used in
  // the frontend workout_model_test.dart so client and server agree. ---

  const uni = (
    over: Partial<WorkoutSetData>,
  ): WorkoutSetData => ({ setNumber: 1, completed: false, ...over });

  it('unilateral volume sums both sides with no double-count (40×10 + 35×10 = 750)', () => {
    const s = uni({ leftWeightKg: 40, leftReps: 10, rightWeightKg: 35, rightReps: 10 });
    expect(setVolume(s)).toBe(750);
    // top-level weight/reps are ignored for a unilateral set.
    const withTop = uni({
      weightKg: 999,
      reps: 99,
      leftWeightKg: 40,
      leftReps: 10,
      rightWeightKg: 35,
      rightReps: 10,
    });
    expect(setVolume(withTop)).toBe(750);
  });

  it('one-side-only completed: 0 completedSets but that side counts toward volume/reps', () => {
    const exercises: WorkoutExerciseData[] = [
      {
        exerciseId: 'curl',
        order: 0,
        primaryMuscle: 'biceps',
        sets: [
          uni({
            leftWeightKg: 40,
            leftReps: 10,
            rightWeightKg: 35,
            rightReps: 10,
            leftCompleted: true,
            rightCompleted: false,
          }),
        ],
      },
    ];
    const stats = computeWorkoutStats(exercises);
    expect(stats.completedSets).toBe(0); // not both sides done
    expect(stats.totalVolume).toBe(400); // only the completed left side
    expect(stats.totalReps).toBe(10);
  });

  it('both-sides completed: 1 completedSet + both contributions', () => {
    const exercises: WorkoutExerciseData[] = [
      {
        exerciseId: 'curl',
        order: 0,
        primaryMuscle: 'biceps',
        sets: [
          uni({
            leftWeightKg: 40,
            leftReps: 10,
            rightWeightKg: 35,
            rightReps: 10,
            leftCompleted: true,
            rightCompleted: true,
          }),
        ],
      },
    ];
    const stats = computeWorkoutStats(exercises);
    expect(stats.completedSets).toBe(1);
    expect(stats.totalVolume).toBe(750);
    expect(stats.totalReps).toBe(20);
  });

  it('isSetCompleted requires BOTH sides for a unilateral set', () => {
    expect(isSetCompleted(uni({ leftWeightKg: 40, leftReps: 10, leftCompleted: true }))).toBe(false);
    expect(
      isSetCompleted(uni({ leftWeightKg: 40, leftReps: 10, leftCompleted: true, rightCompleted: true })),
    ).toBe(true);
  });

  it('PR topStageOf picks the heavier side; weight tie breaks to more reps', () => {
    expect(
      topStageOf(uni({ leftWeightKg: 40, leftReps: 10, rightWeightKg: 35, rightReps: 10 })),
    ).toEqual({ weightKg: 40, reps: 10 });
    // weight tie -> more reps wins
    expect(
      topStageOf(uni({ leftWeightKg: 40, leftReps: 8, rightWeightKg: 40, rightReps: 12 })),
    ).toEqual({ weightKg: 40, reps: 12 });
    // only one positive side
    expect(topStageOf(uni({ leftWeightKg: 40, leftReps: 10, rightWeightKg: 0, rightReps: 0 }))).toEqual({
      weightKg: 40,
      reps: 10,
    });
    // neither positive -> no candidate
    expect(topStageOf(uni({ leftCompleted: true, rightCompleted: true }))).toEqual({
      weightKg: null,
      reps: null,
    });
  });

  it('unilateral DROP set: volume sums both sides over stages; top stage is the heavier side', () => {
    const dropUni: WorkoutSetData = {
      setNumber: 1,
      completed: false,
      setType: 'drop',
      leftCompleted: true,
      rightCompleted: true,
      dropStages: [
        { leftWeightKg: 40, leftReps: 6, rightWeightKg: 50, rightReps: 4 },
        { leftWeightKg: 30, leftReps: 8, rightWeightKg: 35, rightReps: 6 },
      ],
    };
    // 40*6 + 50*4 + 30*8 + 35*6 = 240 + 200 + 240 + 210 = 890
    expect(setVolume(dropUni)).toBe(890);
    expect(setReps(dropUni)).toBe(6 + 4 + 8 + 6);
    // Top stage (stage 0): left 40×6 vs right 50×4 -> right 50 is heavier.
    expect(topStageOf(dropUni)).toEqual({ weightKg: 50, reps: 4 });
  });

  it('enforces valid status transitions', () => {
    expect(canTransition('planned', 'in_progress')).toBe(true);
    expect(canTransition('in_progress', 'paused')).toBe(true);
    expect(canTransition('paused', 'in_progress')).toBe(true);
    expect(canTransition('in_progress', 'completed')).toBe(true);
    expect(canTransition('planned', 'completed')).toBe(false);
    expect(canTransition('completed', 'in_progress')).toBe(false);
    expect(canTransition('cancelled', 'in_progress')).toBe(false);
  });
});

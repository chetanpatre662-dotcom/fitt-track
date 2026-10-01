import { describe, it, expect } from 'vitest';
import {
  canTransition,
  computeWorkoutStats,
  exerciseVolume,
  setVolume,
  type WorkoutExerciseData,
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

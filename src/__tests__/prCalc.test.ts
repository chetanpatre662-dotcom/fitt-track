import { describe, it, expect } from 'vitest';
import { derivePrCandidates, isNewRecord } from '../utils/prCalc.js';
import type { WorkoutExerciseData } from '../utils/workoutCalc.js';

describe('prCalc', () => {
  it('derives max_weight, max_reps, max_volume from completed strength sets', () => {
    const exercises: WorkoutExerciseData[] = [
      {
        exerciseId: 'bench',
        order: 0,
        sets: [
          { setNumber: 1, weightKg: 60, reps: 10, completed: true }, // vol 600
          { setNumber: 2, weightKg: 80, reps: 3, completed: true }, // vol 240, max weight
          { setNumber: 3, weightKg: 50, reps: 15, completed: true }, // vol 750, max reps + max vol
          { setNumber: 4, weightKg: 100, reps: 1, completed: false }, // ignored (not completed)
        ],
      },
    ];
    const cands = derivePrCandidates(exercises);
    const byType = Object.fromEntries(cands.map((c) => [c.recordType, c.value]));
    expect(byType.max_weight).toBe(80);
    expect(byType.max_reps).toBe(15);
    expect(byType.max_volume).toBe(750);
  });

  it('derives cardio best_distance and best_time', () => {
    const exercises: WorkoutExerciseData[] = [
      {
        exerciseId: 'running',
        order: 0,
        sets: [
          { setNumber: 1, distanceM: 5000, durationSeconds: 1500, completed: true },
          { setNumber: 2, distanceM: 8000, durationSeconds: 2400, completed: true },
        ],
      },
    ];
    const cands = derivePrCandidates(exercises);
    const byType = Object.fromEntries(cands.map((c) => [c.recordType, c.value]));
    expect(byType.best_distance).toBe(8000);
    expect(byType.best_time).toBe(2400);
  });

  it('ignores exercises with no completed sets', () => {
    const exercises: WorkoutExerciseData[] = [
      { exerciseId: 'x', order: 0, sets: [{ setNumber: 1, weightKg: 50, reps: 5, completed: false }] },
    ];
    expect(derivePrCandidates(exercises)).toEqual([]);
  });

  it('isNewRecord: strictly greater than previous', () => {
    expect(isNewRecord(100, null)).toBe(true);
    expect(isNewRecord(100, 90)).toBe(true);
    expect(isNewRecord(90, 90)).toBe(false);
    expect(isNewRecord(80, 90)).toBe(false);
    expect(isNewRecord(0, null)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { bestSetForWorkout } from '../utils/prCalc.js';
import type { WorkoutSetData } from '../utils/workoutCalc.js';

/** Minimal valid set factory for the §3 matrix. */
function set(partial: Partial<WorkoutSetData>): WorkoutSetData {
  return { setNumber: 1, completed: true, ...partial };
}

describe('bestSetForWorkout (§3 PR reps root-cause fix)', () => {
  it('35kg × 3 -> (35, 3, est 38.5)', () => {
    const best = bestSetForWorkout([set({ weightKg: 35, reps: 3 })]);
    expect(best).toEqual({ weightKg: 35, reps: 3, volume: 105, estimated1Rm: 38.5 });
  });

  it('35kg × 8 -> (35, 8, est 44.3)', () => {
    const best = bestSetForWorkout([set({ weightKg: 35, reps: 8 })]);
    expect(best).toEqual({ weightKg: 35, reps: 8, volume: 280, estimated1Rm: 44.3 });
  });

  it('35kg × 12 -> (35, 12, est 49.0)', () => {
    const best = bestSetForWorkout([set({ weightKg: 35, reps: 12 })]);
    expect(best?.weightKg).toBe(35);
    expect(best?.reps).toBe(12);
    expect(best?.estimated1Rm).toBe(49);
  });

  it('35×5 + 35×8 -> tie at max weight resolves to highest reps (35, 8, est 44.3)', () => {
    const best = bestSetForWorkout([
      set({ setNumber: 1, weightKg: 35, reps: 5 }),
      set({ setNumber: 2, weightKg: 35, reps: 8 }),
    ]);
    expect(best?.weightKg).toBe(35);
    expect(best?.reps).toBe(8);
    expect(best?.estimated1Rm).toBe(44.3);
  });

  it('40×3 + 20×12 -> heavier-fewer-reps wins; reps are 3, NEVER 12 (40, 3, est 44.0)', () => {
    const best = bestSetForWorkout([
      set({ setNumber: 1, weightKg: 40, reps: 3 }),
      set({ setNumber: 2, weightKg: 20, reps: 12 }),
    ]);
    expect(best?.weightKg).toBe(40);
    expect(best?.reps).toBe(3);
    expect(best?.estimated1Rm).toBe(44);
  });

  it('only a reps-null set -> null (no valid set remains)', () => {
    const best = bestSetForWorkout([set({ weightKg: 35, reps: null })]);
    expect(best).toBeNull();
  });

  it('40×(null) + 30×10 -> null set filtered out before anything (30, 10, est 40.0)', () => {
    const best = bestSetForWorkout([
      set({ setNumber: 1, weightKg: 40, reps: null }),
      set({ setNumber: 2, weightKg: 30, reps: 10 }),
    ]);
    expect(best?.weightKg).toBe(30);
    expect(best?.reps).toBe(10);
    expect(best?.estimated1Rm).toBe(40);
  });

  it('40×(null) + 40×5 + 40×8 -> valid-set filter runs BEFORE tie-break (40, 8, est 50.7)', () => {
    const best = bestSetForWorkout([
      set({ setNumber: 1, weightKg: 40, reps: null }),
      set({ setNumber: 2, weightKg: 40, reps: 5 }),
      set({ setNumber: 3, weightKg: 40, reps: 8 }),
    ]);
    expect(best?.weightKg).toBe(40);
    expect(best?.reps).toBe(8);
    expect(best?.estimated1Rm).toBe(50.7);
  });

  it('reps > 30 -> estimated1Rm is null (Epley out of range)', () => {
    const best = bestSetForWorkout([set({ weightKg: 20, reps: 40 })]);
    expect(best?.weightKg).toBe(20);
    expect(best?.reps).toBe(40);
    expect(best?.estimated1Rm).toBeNull();
  });

  it('ignores non-completed sets', () => {
    const best = bestSetForWorkout([
      set({ setNumber: 1, weightKg: 100, reps: 1, completed: false }),
      set({ setNumber: 2, weightKg: 35, reps: 8 }),
    ]);
    expect(best?.weightKg).toBe(35);
    expect(best?.reps).toBe(8);
  });
});

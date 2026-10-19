import { describe, it, expect } from 'vitest';
import {
  computeWorkoutStats,
  setReps,
  setVolume,
  topStageOf,
  type WorkoutExerciseData,
  type WorkoutSetData,
} from '../utils/workoutCalc.js';
import { bestSetForWorkout, derivePrCandidates } from '../utils/prCalc.js';
import { workoutUpsertSchema } from '../validators/workoutValidators.js';

/**
 * Drop-set correctness across the backend aggregate + PR math and the zod
 * validator. A drop set counts as ONE set; its reps/volume are the SUM of its
 * stages; its PR weight/reps pair is the TOP (first) stage only.
 */

const normal = (
  weightKg: number,
  reps: number,
  completed = true,
): WorkoutSetData => ({ setNumber: 1, weightKg, reps, completed });

const drop = (
  stages: Array<[number, number]>,
  completed = true,
): WorkoutSetData => ({
  setNumber: 2,
  // The top-level fields mirror stage 0 for display continuity.
  weightKg: stages[0]?.[0] ?? null,
  reps: stages[0]?.[1] ?? null,
  completed,
  setType: 'drop',
  dropStages: stages.map(([weightKg, reps]) => ({ weightKg, reps })),
});

describe('drop-set helpers (drop-aware, completion-agnostic)', () => {
  it('setReps sums stage reps for a drop set, uses top-level otherwise', () => {
    expect(setReps(normal(60, 8))).toBe(8);
    expect(setReps(drop([[60, 8], [50, 6], [40, 5]]))).toBe(19);
  });

  it('setVolume sums stage volumes for a drop set', () => {
    expect(setVolume(normal(60, 8))).toBe(480);
    // 60*8 + 50*6 + 40*5 = 480 + 300 + 200 = 980
    expect(setVolume(drop([[60, 8], [50, 6], [40, 5]]))).toBe(980);
  });

  it('topStageOf returns stage 0 for a drop set, top-level otherwise', () => {
    expect(topStageOf(normal(60, 8))).toEqual({ weightKg: 60, reps: 8 });
    expect(topStageOf(drop([[70, 5], [50, 8]]))).toEqual({ weightKg: 70, reps: 5 });
  });

  it('a drop flag with ZERO stages degrades to a normal set (uses top-level)', () => {
    const degenerate: WorkoutSetData = {
      setNumber: 1,
      weightKg: 55,
      reps: 7,
      completed: true,
      setType: 'drop',
      dropStages: [],
    };
    expect(setReps(degenerate)).toBe(7);
    expect(setVolume(degenerate)).toBe(385);
    expect(topStageOf(degenerate)).toEqual({ weightKg: 55, reps: 7 });
  });

  it('a normal set carrying stray stages is NOT stage-summed', () => {
    const stray: WorkoutSetData = {
      setNumber: 1,
      weightKg: 55,
      reps: 7,
      completed: true,
      setType: 'normal',
      dropStages: [{ weightKg: 30, reps: 20 }],
    };
    expect(setReps(stray)).toBe(7);
    expect(setVolume(stray)).toBe(385);
  });
});

describe('drop-set aggregate (computeWorkoutStats)', () => {
  const exercises: WorkoutExerciseData[] = [
    {
      exerciseId: 'bench',
      order: 0,
      primaryMuscle: 'chest',
      sets: [
        normal(60, 8), // vol 480, reps 8
        drop([[60, 8], [50, 6], [40, 5]]), // ONE set, reps 19, vol 980
      ],
    },
  ];

  it('counts a drop set once and sums its stage reps/volume', () => {
    const stats = computeWorkoutStats(exercises);
    expect(stats.totalSets).toBe(2);
    expect(stats.completedSets).toBe(2);
    expect(stats.totalReps).toBe(8 + 19);
    expect(stats.totalVolume).toBe(480 + 980);
  });

  it('an incomplete drop set contributes 0 (completion gate unchanged)', () => {
    const stats = computeWorkoutStats([
      {
        exerciseId: 'bench',
        order: 0,
        sets: [drop([[60, 8], [50, 6]], false)],
      },
    ]);
    expect(stats.completedSets).toBe(0);
    expect(stats.totalReps).toBe(0);
    expect(stats.totalVolume).toBe(0);
  });
});

describe('drop-set PR calc', () => {
  it('max_weight/max_reps come from the TOP stage, max_volume from the sum', () => {
    const exercises: WorkoutExerciseData[] = [
      {
        exerciseId: 'bench',
        order: 0,
        sets: [
          normal(70, 5), // top weight candidate
          drop([[65, 6], [50, 10], [40, 12]]), // top stage 65×6; sum vol 65*6+50*10+40*12=390+500+480=1370
        ],
      },
    ];
    const cands = derivePrCandidates(exercises);
    const byType = Object.fromEntries(cands.map((c) => [c.recordType, c.value]));
    // The lightest drop stage (12 reps) must NOT create a spurious max_reps.
    expect(byType.max_weight).toBe(70);
    expect(byType.max_reps).toBe(6); // top stage reps of the drop set (6) vs normal (5)
    expect(byType.max_volume).toBe(1370);
  });

  it('bestSetForWorkout reads the PR pair from stage 0 even when top-level DISAGREES', () => {
    // Malformed payload: top-level says 999×99 but stage 0 is 80×4.
    const malformed: WorkoutSetData = {
      setNumber: 1,
      weightKg: 999,
      reps: 99,
      completed: true,
      setType: 'drop',
      dropStages: [{ weightKg: 80, reps: 4 }, { weightKg: 60, reps: 8 }],
    };
    const best = bestSetForWorkout([malformed]);
    expect(best).not.toBeNull();
    expect(best!.weightKg).toBe(80);
    expect(best!.reps).toBe(4);
    // volume is the stage sum, not 999*99.
    expect(best!.volume).toBe(80 * 4 + 60 * 8);
  });

  it('bestSetForWorkout.volume equals the aggregate volume for a drop set (progression agreement)', () => {
    const sets = [drop([[60, 8], [50, 6], [40, 5]])]; // vol 980
    const best = bestSetForWorkout(sets);
    const aggregate = computeWorkoutStats([{ exerciseId: 'x', order: 0, sets }]);
    expect(best!.volume).toBe(980);
    expect(best!.volume).toBe(aggregate.totalVolume);
  });
});

describe('drop-set zod validator (.superRefine invariant)', () => {
  const baseExercise = { exerciseId: 'bench', order: 0 };

  const parseSet = (set: Record<string, unknown>) =>
    workoutUpsertSchema.safeParse({
      name: 'W',
      exercises: [{ ...baseExercise, sets: [set] }],
    });

  it('REJECTS setType:drop with no stages', () => {
    const res = parseSet({ setNumber: 1, setType: 'drop', completed: true });
    expect(res.success).toBe(false);
  });

  it('REJECTS setType:drop with empty stages', () => {
    const res = parseSet({ setNumber: 1, setType: 'drop', dropStages: [], completed: true });
    expect(res.success).toBe(false);
  });

  it('REJECTS a non-drop set carrying stray stages', () => {
    const res = parseSet({
      setNumber: 1,
      setType: 'normal',
      dropStages: [{ weightKg: 40, reps: 10 }],
      completed: true,
    });
    expect(res.success).toBe(false);
  });

  it('ACCEPTS a valid drop set', () => {
    const res = parseSet({
      setNumber: 1,
      setType: 'drop',
      dropStages: [{ weightKg: 60, reps: 8 }, { weightKg: 40, reps: 10 }],
      completed: true,
    });
    expect(res.success).toBe(true);
  });

  it('ACCEPTS a legacy set with no setType/dropStages (backward compat)', () => {
    const res = parseSet({ setNumber: 1, weightKg: 60, reps: 8, completed: true });
    expect(res.success).toBe(true);
  });
});

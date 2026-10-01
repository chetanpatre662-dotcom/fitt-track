import { describe, it, expect } from 'vitest';
import { keepValidExerciseIds } from '../ai/validateExerciseIds.js';
import { workoutRecommendationSchema } from '../ai/schemas.js';

describe('keepValidExerciseIds', () => {
  it('drops exercises with ids not in the valid set', () => {
    const items = [
      { exerciseId: 'barbell-bench-press', sets: 3 },
      { exerciseId: 'ai-invented-id', sets: 3 },
      { exerciseId: 'deadlift', sets: 3 },
    ];
    const valid = new Set(['barbell-bench-press', 'deadlift']);
    const kept = keepValidExerciseIds(items, valid);
    expect(kept.map((k) => k.exerciseId)).toEqual(['barbell-bench-press', 'deadlift']);
  });

  it('returns empty when nothing matches', () => {
    expect(keepValidExerciseIds([{ exerciseId: 'x' }], new Set(['y']))).toEqual([]);
  });
});

describe('workoutRecommendationSchema', () => {
  it('accepts a valid recommendation', () => {
    const parsed = workoutRecommendationSchema.parse({
      title: 'Push Day',
      goal: 'muscle_gain',
      durationMinutes: 45,
      exercises: [
        { exerciseId: 'barbell-bench-press', sets: 4, repMin: 6, repMax: 10, restSeconds: 120, reason: 'compound' },
      ],
      notes: 'Warm up first.',
    });
    expect(parsed.exercises).toHaveLength(1);
    expect(parsed.durationMinutes).toBe(45);
  });

  it('rejects invalid recommendation (no exercises)', () => {
    expect(() =>
      workoutRecommendationSchema.parse({ title: 'x', goal: 'y', durationMinutes: 45, exercises: [] }),
    ).toThrow();
  });

  it('defaults optional reason/notes', () => {
    const parsed = workoutRecommendationSchema.parse({
      title: 'x',
      goal: 'y',
      durationMinutes: 30,
      exercises: [{ exerciseId: 'a', sets: 3, repMin: 8, repMax: 12, restSeconds: 60 }],
    });
    expect(parsed.exercises[0].reason).toBe('');
    expect(parsed.notes).toBe('');
  });
});

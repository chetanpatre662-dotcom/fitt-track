import { describe, it, expect } from 'vitest';
import { EXERCISES } from '../data/exerciseSeed.js';
import { ExerciseService } from '../services/exerciseService.js';

describe('ExerciseService.applyFilters (combinable filters)', () => {
  it('returns all exercises with no filters', () => {
    const res = ExerciseService.applyFilters(EXERCISES, {});
    expect(res.length).toBe(EXERCISES.length);
    expect(res.length).toBeGreaterThan(40);
  });

  it('filters by muscle group (primary or secondary)', () => {
    const back = ExerciseService.applyFilters(EXERCISES, { muscle: 'back' });
    expect(back.length).toBeGreaterThan(0);
    expect(back.every((e) => e.primaryMuscle === 'back' || e.secondaryMuscles.includes('back'))).toBe(true);
    expect(back.some((e) => e.id === 'deadlift')).toBe(true);
  });

  it('GYM + BACK returns only gym-capable back exercises', () => {
    const res = ExerciseService.applyFilters(EXERCISES, { location: 'gym', muscle: 'back' });
    expect(res.length).toBeGreaterThan(0);
    for (const e of res) {
      expect(e.location === 'gym' || e.location === 'both').toBe(true);
      expect(e.primaryMuscle === 'back' || e.secondaryMuscles.includes('back')).toBe(true);
    }
    // A home-only back exercise (inverted row) must be excluded.
    expect(res.some((e) => e.id === 'inverted-row')).toBe(false);
  });

  it('GYM + BACK + CABLE returns only matching exercises', () => {
    const res = ExerciseService.applyFilters(EXERCISES, {
      location: 'gym',
      muscle: 'back',
      equipment: 'cable',
    });
    expect(res.length).toBeGreaterThan(0);
    for (const e of res) {
      expect(e.location === 'gym' || e.location === 'both').toBe(true);
      expect(e.primaryMuscle === 'back' || e.secondaryMuscles.includes('back')).toBe(true);
      expect(e.equipment.includes('cable')).toBe(true);
    }
    expect(res.some((e) => e.id === 'seated-cable-row' || e.id === 'lat-pulldown')).toBe(true);
  });

  it('HOME filter includes both-location exercises but excludes gym-only', () => {
    const res = ExerciseService.applyFilters(EXERCISES, { location: 'home' });
    expect(res.every((e) => e.location === 'home' || e.location === 'both')).toBe(true);
    expect(res.some((e) => e.id === 'push-up')).toBe(true);
    expect(res.some((e) => e.id === 'leg-press')).toBe(false); // gym only
  });

  it('filters by difficulty and type', () => {
    const res = ExerciseService.applyFilters(EXERCISES, { difficulty: 'beginner', type: 'bodyweight' });
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((e) => e.difficulty === 'beginner' && e.type === 'bodyweight')).toBe(true);
  });

  it('keyword search matches name, muscle and keywords', () => {
    const byName = ExerciseService.applyFilters(EXERCISES, { q: 'bench press' });
    expect(byName.some((e) => e.id === 'barbell-bench-press')).toBe(true);

    const byKeyword = ExerciseService.applyFilters(EXERCISES, { q: 'pecs' });
    expect(byKeyword.length).toBeGreaterThan(0);

    const none = ExerciseService.applyFilters(EXERCISES, { q: 'zzzznotanexercise' });
    expect(none.length).toBe(0);
  });

  it("treats 'all' sentinels as no filter", () => {
    const res = ExerciseService.applyFilters(EXERCISES, {
      location: 'all',
      muscle: 'all',
      difficulty: 'all',
      type: 'all',
    });
    expect(res.length).toBe(EXERCISES.length);
  });

  it('every seed exercise has required fields', () => {
    for (const e of EXERCISES) {
      expect(e.id).toBeTruthy();
      expect(e.name).toBeTruthy();
      expect(e.instructions.length).toBeGreaterThan(0);
      expect(e.recommendedSets).toBeGreaterThan(0);
      expect(e.keywords.length).toBeGreaterThan(0);
    }
  });

  it('has unique exercise ids', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

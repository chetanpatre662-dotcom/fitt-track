import { describe, it, expect } from 'vitest';
import { measurementCreateSchema } from '../validators/measurementValidators.js';
import {
  progressPhotoCreateSchema,
  PHOTO_CATEGORIES,
} from '../validators/progressPhotoValidators.js';
import {
  dailyPlanGenerateSchema,
  dailyPlanUpdateSchema,
} from '../validators/dailyPlanValidators.js';

describe('Item 6 — measurement validator', () => {
  it('accepts a valid height/weight record', () => {
    const r = measurementCreateSchema.safeParse({ heightCm: 180, weightKg: 80 });
    expect(r.success).toBe(true);
  });
  it('rejects out-of-range values', () => {
    expect(measurementCreateSchema.safeParse({ heightCm: 10, weightKg: 80 }).success).toBe(false);
    expect(measurementCreateSchema.safeParse({ heightCm: 180, weightKg: 5 }).success).toBe(false);
  });
});

describe('Item 8 — progress photo validator', () => {
  it('accepts valid metadata with an allowed category', () => {
    const r = progressPhotoCreateSchema.safeParse({
      storagePath: 'users/abc/progressPhotos/1.jpg',
      category: 'chest',
    });
    expect(r.success).toBe(true);
  });
  it('rejects an unknown category', () => {
    const r = progressPhotoCreateSchema.safeParse({
      storagePath: 'users/abc/progressPhotos/1.jpg',
      category: 'face',
    });
    expect(r.success).toBe(false);
  });
  it('exposes the seven required categories', () => {
    expect(PHOTO_CATEGORIES).toEqual(['chest', 'back', 'shoulders', 'arms', 'legs', 'abs', 'full_body']);
  });
});

describe('Item 9 — daily plan validators', () => {
  it('generate accepts an optional muscle focus', () => {
    expect(dailyPlanGenerateSchema.safeParse({}).success).toBe(true);
    expect(dailyPlanGenerateSchema.safeParse({ muscle: 'back', force: true }).success).toBe(true);
    expect(dailyPlanGenerateSchema.safeParse({ muscle: 'not_a_muscle' }).success).toBe(false);
  });

  it('update accepts a muscle-group focus (regenerate mode)', () => {
    const r = dailyPlanUpdateSchema.safeParse({ muscleGroups: ['back', 'biceps'] });
    expect(r.success).toBe(true);
  });

  it('update accepts an explicit structured exercise list (user-edited mode)', () => {
    const r = dailyPlanUpdateSchema.safeParse({
      exercises: [{ exerciseId: 'ex1', sets: 3, repMin: 8, repMax: 12, restSeconds: 90 }],
    });
    expect(r.success).toBe(true);
  });

  it('update rejects an invalid muscle group', () => {
    expect(dailyPlanUpdateSchema.safeParse({ muscleGroups: ['wings'] }).success).toBe(false);
  });
});

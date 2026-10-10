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
import {
  sharingPatchUnifiedSchema,
  SHARING_CATEGORIES,
  dietPlanUpsertSchema,
} from '../validators/trainerValidators.js';

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

describe('FEAT-001 — sharingPatchUnifiedSchema', () => {
  it('exposes the five sharing categories in a stable order', () => {
    expect(SHARING_CATEGORIES).toEqual([
      'workoutHistory',
      'nutrition',
      'measurements',
      'progressPhotos',
      'progressReports',
    ]);
  });

  it('accepts a single granular key', () => {
    expect(sharingPatchUnifiedSchema.safeParse({ nutrition: true }).success).toBe(true);
  });

  it('accepts multiple granular keys', () => {
    const r = sharingPatchUnifiedSchema.safeParse({
      workoutHistory: true,
      measurements: false,
      progressReports: true,
    });
    expect(r.success).toBe(true);
  });

  it('accepts the legacy boolean (mapping to progressPhotos is the controller’s job)', () => {
    expect(sharingPatchUnifiedSchema.safeParse({ shareProgressWithTrainer: true }).success).toBe(true);
  });

  it('accepts a MIXED legacy+granular body at the schema level (400 enforced in the controller)', () => {
    // The schema permits the shape; the controller rejects the combination with
    // a 400. This keeps the error ownership explicit and avoids a z.union.
    expect(
      sharingPatchUnifiedSchema.safeParse({ shareProgressWithTrainer: true, nutrition: true }).success,
    ).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(sharingPatchUnifiedSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a wrong-typed value', () => {
    expect(sharingPatchUnifiedSchema.safeParse({ nutrition: 'yes' }).success).toBe(false);
  });

  it('rejects an unknown key (.strict)', () => {
    expect(sharingPatchUnifiedSchema.safeParse({ bogus: true }).success).toBe(false);
  });
});

describe('FEAT-002 — dietPlanUpsertSchema', () => {
  it('accepts a text-only plan', () => {
    expect(dietPlanUpsertSchema.safeParse({ text: 'Oats + eggs' }).success).toBe(true);
  });

  it('accepts an image-only plan', () => {
    expect(
      dietPlanUpsertSchema.safeParse({
        imageStoragePath: 'users/trainer-1/dietPlans/stu/1.jpg',
      }).success,
    ).toBe(true);
  });

  it('accepts both text and image together', () => {
    expect(
      dietPlanUpsertSchema.safeParse({
        text: 'See image',
        imageStoragePath: 'users/trainer-1/dietPlans/stu/1.jpg',
      }).success,
    ).toBe(true);
  });

  it('rejects an empty body (needs text or image)', () => {
    expect(dietPlanUpsertSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a body with only nulls', () => {
    expect(dietPlanUpsertSchema.safeParse({ text: null, imageStoragePath: null }).success).toBe(false);
  });

  it('rejects text over the max length', () => {
    expect(dietPlanUpsertSchema.safeParse({ text: 'a'.repeat(5001) }).success).toBe(false);
  });

  it('rejects an unknown key (.strict)', () => {
    expect(dietPlanUpsertSchema.safeParse({ text: 'x', bogus: 1 }).success).toBe(false);
  });
});

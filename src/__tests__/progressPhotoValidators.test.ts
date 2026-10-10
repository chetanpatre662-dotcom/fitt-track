import { describe, it, expect } from 'vitest';
import {
  progressPhotoCreateSchema,
  PHOTO_CATEGORIES,
} from '../validators/progressPhotoValidators.js';

const base = { storagePath: 'users/abc/progressPhotos/1.jpg' };

describe('progressPhotoCreateSchema — preset categories', () => {
  it('accepts every preset (non-custom) category', () => {
    for (const category of PHOTO_CATEGORIES) {
      if (category === 'custom') continue;
      const r = progressPhotoCreateSchema.safeParse({ ...base, category });
      expect(r.success, `category ${category} should be valid`).toBe(true);
    }
  });
});

describe('progressPhotoCreateSchema — custom category', () => {
  it('accepts category "custom" with a non-empty customLabel', () => {
    const r = progressPhotoCreateSchema.safeParse({
      ...base,
      category: 'custom',
      customLabel: 'Calves',
    });
    expect(r.success).toBe(true);
  });

  it('rejects category "custom" with a missing customLabel', () => {
    const r = progressPhotoCreateSchema.safeParse({ ...base, category: 'custom' });
    expect(r.success).toBe(false);
  });

  it('rejects category "custom" with an empty/whitespace customLabel', () => {
    expect(
      progressPhotoCreateSchema.safeParse({ ...base, category: 'custom', customLabel: '' }).success,
    ).toBe(false);
    expect(
      progressPhotoCreateSchema.safeParse({ ...base, category: 'custom', customLabel: '   ' })
        .success,
    ).toBe(false);
  });

  it('rejects a customLabel longer than 40 characters', () => {
    const r = progressPhotoCreateSchema.safeParse({
      ...base,
      category: 'custom',
      customLabel: 'x'.repeat(41),
    });
    expect(r.success).toBe(false);
  });
});

describe('progressPhotoCreateSchema — invalid input', () => {
  it('rejects an unknown category', () => {
    const r = progressPhotoCreateSchema.safeParse({ ...base, category: 'face' });
    expect(r.success).toBe(false);
  });

  it('rejects an empty storagePath', () => {
    const r = progressPhotoCreateSchema.safeParse({ storagePath: '', category: 'chest' });
    expect(r.success).toBe(false);
  });
});

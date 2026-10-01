import { describe, it, expect } from 'vitest';
import { ageFromDob, bmi, bmr, estimateTargets, tdee } from '../utils/fitnessCalc.js';

describe('fitnessCalc', () => {
  it('computes BMI', () => {
    expect(bmi(74, 178)).toBeCloseTo(23.4, 1);
    expect(bmi(0, 0)).toBe(0);
  });

  it('computes Mifflin-St Jeor BMR for male', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(bmr({ weightKg: 80, heightCm: 180, ageYears: 30, gender: 'male' })).toBe(1780);
  });

  it('computes BMR for female', () => {
    // 10*60 + 6.25*165 - 5*28 - 161 = 600 + 1031.25 - 140 - 161 = 1330.25 -> 1330
    expect(bmr({ weightKg: 60, heightCm: 165, ageYears: 28, gender: 'female' })).toBe(1330);
  });

  it('applies activity multiplier for TDEE', () => {
    expect(tdee(1780, 'sedentary')).toBe(Math.round(1780 * 1.2));
    expect(tdee(1780, 'very_active')).toBe(Math.round(1780 * 1.9));
  });

  it('estimates targets with fat-loss deficit and sensible macros', () => {
    const t = estimateTargets({
      weightKg: 80,
      heightCm: 180,
      ageYears: 30,
      gender: 'male',
      activity: 'moderate',
      goal: 'fat_loss',
    });
    // maintenance = round(1780*1.55)=2759; fat_loss delta -400 => 2359
    expect(t.calories).toBe(2359);
    expect(t.protein).toBe(Math.round(1.8 * 80)); // 144
    expect(t.isCustom).toBe(false);
    // macros should be non-negative and roughly reconcile to calories.
    const kcal = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    expect(Math.abs(kcal - t.calories)).toBeLessThan(30);
    expect(t.waterMl).toBe(Math.round(35 * 80));
  });

  it('adds a surplus for muscle gain', () => {
    const cut = estimateTargets({
      weightKg: 80, heightCm: 180, ageYears: 30, gender: 'male', activity: 'moderate', goal: 'fat_loss',
    });
    const bulk = estimateTargets({
      weightKg: 80, heightCm: 180, ageYears: 30, gender: 'male', activity: 'moderate', goal: 'muscle_gain',
    });
    expect(bulk.calories).toBeGreaterThan(cut.calories);
  });

  it('never returns below the calorie floor', () => {
    const t = estimateTargets({
      weightKg: 40, heightCm: 150, ageYears: 80, gender: 'female', activity: 'sedentary', goal: 'weight_loss',
    });
    expect(t.calories).toBeGreaterThanOrEqual(1200);
  });

  it('computes age from DOB', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    expect(ageFromDob('2000-06-15', now)).toBe(26);
    expect(ageFromDob('2000-06-16', now)).toBe(25); // birthday not yet reached
    expect(ageFromDob('not-a-date', now)).toBe(0);
  });
});

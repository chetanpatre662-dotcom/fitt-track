import { describe, it, expect } from 'vitest';
import { computeStreak } from '../utils/streakCalc.js';

describe('computeStreak', () => {
  const today = new Date(2026, 0, 10); // 2026-01-10

  it('returns 0 for no successes', () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-01-10', '2026-01-09', '2026-01-08'], today)).toBe(3);
  });

  it('counts a streak ending yesterday (not yet woken today)', () => {
    expect(computeStreak(['2026-01-09', '2026-01-08'], today)).toBe(2);
  });

  it('breaks the streak on a gap', () => {
    expect(computeStreak(['2026-01-10', '2026-01-08', '2026-01-07'], today)).toBe(1);
  });

  it('ignores duplicate date keys', () => {
    expect(computeStreak(['2026-01-10', '2026-01-10', '2026-01-09'], today)).toBe(2);
  });

  it('returns 0 when the most recent success is older than yesterday', () => {
    expect(computeStreak(['2026-01-05', '2026-01-04'], today)).toBe(0);
  });
});

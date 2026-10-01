import { describe, it, expect } from 'vitest';
import { completionPercent, isRoutineOnDate, weekdayForDateKey } from '../utils/routineCalc.js';

describe('routineCalc', () => {
  it('computes weekday for a date key (0=Sun..6=Sat)', () => {
    // 2026-01-04 is a Sunday.
    expect(weekdayForDateKey('2026-01-04')).toBe(0);
    // 2026-01-05 is a Monday.
    expect(weekdayForDateKey('2026-01-05')).toBe(1);
  });

  it('isRoutineOnDate matches repeatDays', () => {
    // Monday routine (weekday 1).
    expect(isRoutineOnDate([1, 3, 5], '2026-01-05')).toBe(true); // Mon
    expect(isRoutineOnDate([1, 3, 5], '2026-01-06')).toBe(false); // Tue
  });

  it('empty repeatDays means every day', () => {
    expect(isRoutineOnDate([], '2026-01-06')).toBe(true);
    expect(isRoutineOnDate([], '2026-01-07')).toBe(true);
  });

  it('completionPercent', () => {
    expect(completionPercent(0, 0)).toBe(0);
    expect(completionPercent(4, 2)).toBe(50);
    expect(completionPercent(3, 3)).toBe(100);
    expect(completionPercent(3, 1)).toBe(33);
  });
});

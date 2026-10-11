import { describe, it, expect, vi } from 'vitest';
import {
  STREAK_LOOKBACK_DAYS,
  buildMonthDays,
  classifyDay,
  createdAtLocalDay,
  fmt,
  monthBounds,
  qualifyingStreaks,
  requiredRoutinesForDay,
} from '../utils/routineCalendarCalc.js';
import { computeStreak } from '../utils/streakCalc.js';

// --- test helpers ---------------------------------------------------------

type Routine = Record<string, unknown>;
type Completion = Record<string, unknown>;

function routine(id: string, opts: Partial<Routine> = {}): Routine {
  return {
    id,
    name: id,
    enabled: true,
    repeatDays: [], // empty = every day
    createdAt: '2000-01-01', // existed "forever" by default
    ...opts,
  };
}

function completion(dateKey: string, routineId: string, status = 'completed'): Completion {
  return { id: `${dateKey}__${routineId}`, dateKey, routineId, status };
}

/** Build a completed-record list for every routine on a set of dateKeys. */
function completedFor(dateKeys: string[], routineIds: string[]): Completion[] {
  const out: Completion[] = [];
  for (const dk of dateKeys) for (const rid of routineIds) out.push(completion(dk, rid));
  return out;
}

// =========================================================================
// Case 1 & 2 & 3: month layout / boundaries / leap year
// =========================================================================

describe('monthBounds + buildMonthDays day counts (cases 1,2,3)', () => {
  it('Feb 2025 (non-leap) has 28 days, last key 2025-02-28', () => {
    const { start, end } = monthBounds(2025, 2);
    expect(start).toBe('2025-02-01');
    expect(end).toBe('2025-02-28');
    const days = buildMonthDays([], [], 2025, 2, '2025-02-15');
    expect(days.length).toBe(28);
    expect(days[27].dateKey).toBe('2025-02-28');
  });

  it('Feb 2024 (leap) has 29 days and includes 2024-02-29', () => {
    const { end } = monthBounds(2024, 2);
    expect(end).toBe('2024-02-29');
    const days = buildMonthDays([], [], 2024, 2, '2024-02-15');
    expect(days.length).toBe(29);
    expect(days.some((d) => d.dateKey === '2024-02-29')).toBe(true);
  });

  it('April has 30 days, July has 31 days', () => {
    expect(monthBounds(2025, 4).end).toBe('2025-04-30');
    expect(monthBounds(2025, 7).end).toBe('2025-07-31');
    expect(buildMonthDays([], [], 2025, 4, '2025-04-10').length).toBe(30);
    expect(buildMonthDays([], [], 2025, 7, '2025-07-10').length).toBe(31);
  });

  it('day 1 maps to the first dateKey (weekday mapping is a client concern)', () => {
    const days = buildMonthDays([], [], 2025, 6, '2025-06-15');
    expect(days[0].dateKey).toBe('2025-06-01');
  });
});

// =========================================================================
// Case 5: completion calc from persisted states
// =========================================================================

describe('day-state from persisted completions (case 5)', () => {
  const today = '2025-06-30';
  const r = [routine('r1'), routine('r2')];

  it('all required completed -> full', () => {
    const comps = completedFor(['2025-06-10'], ['r1', 'r2']);
    const days = buildMonthDays(r, comps, 2025, 6, today);
    const d = days.find((x) => x.dateKey === '2025-06-10')!;
    expect(d.state).toBe('full');
    expect(d.completionPercent).toBe(100);
  });

  it('some completed (past) -> partial state, missed semantics', () => {
    const comps = completedFor(['2025-06-10'], ['r1']);
    const days = buildMonthDays(r, comps, 2025, 6, today);
    const d = days.find((x) => x.dateKey === '2025-06-10')!;
    expect(d.state).toBe('partial');
    expect(d.completed).toBe(1);
    expect(d.total).toBe(2);
  });
});

// =========================================================================
// Case 6: missed-day logic INCLUDING Finding #1 (CRITICAL)
// =========================================================================

describe('Finding #1 — historical required-set independent of record existence (case 6)', () => {
  const today = '2025-06-30';
  const r = [routine('r1')];

  it('past day with required routine and ZERO records -> missed AND MISS (breaks streak)', () => {
    const days = buildMonthDays(r, [], 2025, 6, today);
    const d = days.find((x) => x.dateKey === '2025-06-10')!;
    expect(d.state).toBe('missed');
    expect(classifyDay(r, [], '2025-06-10', today)).toBe('MISS');
  });

  it('past day all skipped -> missed + MISS', () => {
    const comps = [completion('2025-06-10', 'r1', 'skipped')];
    const days = buildMonthDays(r, comps, 2025, 6, today);
    expect(days.find((x) => x.dateKey === '2025-06-10')!.state).toBe('missed');
    expect(classifyDay(r, comps, '2025-06-10', today)).toBe('MISS');
  });

  it('past day all pending -> missed + MISS', () => {
    const comps = [completion('2025-06-10', 'r1', 'pending')];
    const days = buildMonthDays(r, comps, 2025, 6, today);
    expect(days.find((x) => x.dateKey === '2025-06-10')!.state).toBe('missed');
    expect(classifyDay(r, comps, '2025-06-10', today)).toBe('MISS');
  });

  it('past day with ZERO scheduled routines -> none/NEUTRAL (does NOT break)', () => {
    // routine scheduled only on Mondays; 2025-06-10 is a Tuesday
    const monOnly = [routine('r1', { repeatDays: [1] })];
    const days = buildMonthDays(monOnly, [], 2025, 6, today);
    expect(days.find((x) => x.dateKey === '2025-06-10')!.state).toBe('none');
    expect(classifyDay(monOnly, [], '2025-06-10', today)).toBe('NEUTRAL');
  });
});

// =========================================================================
// Case 7 & 8: future never missed/full; today in-progress never missed
// =========================================================================

describe('future + today-in-progress rules (cases 7,8)', () => {
  const today = '2025-06-15';
  const r = [routine('r1')];

  it('future day with scheduled routine and no records -> never missed, never full', () => {
    const days = buildMonthDays(r, [], 2025, 6, today);
    const d = days.find((x) => x.dateKey === '2025-06-20')!;
    expect(d.state).not.toBe('missed');
    expect(d.state).not.toBe('full');
    expect(classifyDay(r, [], '2025-06-20', today)).toBe('FUTURE');
  });

  it('future day with a stray completed record is still FUTURE / never full', () => {
    const comps = [completion('2025-06-20', 'r1', 'completed')];
    expect(classifyDay(r, comps, '2025-06-20', today)).toBe('FUTURE');
    const days = buildMonthDays(r, comps, 2025, 6, today);
    expect(days.find((x) => x.dateKey === '2025-06-20')!.state).not.toBe('full');
  });

  it('today with incomplete required routines -> not missed', () => {
    const days = buildMonthDays(r, [], 2025, 6, today);
    const d = days.find((x) => x.dateKey === today)!;
    expect(d.state).not.toBe('missed');
    expect(classifyDay(r, [], today, today)).toBe('NEUTRAL'); // in progress, not a miss
  });

  it('today fully complete -> full + QUALIFYING', () => {
    const comps = completedFor([today], ['r1']);
    const days = buildMonthDays(r, comps, 2025, 6, today);
    expect(days.find((x) => x.dateKey === today)!.state).toBe('full');
    expect(classifyDay(r, comps, today, today)).toBe('QUALIFYING');
  });
});

// =========================================================================
// Case 9 & 10: qualifyingStreaks (strict + NEUTRAL-aware) — NOT computeStreak
// =========================================================================

describe('qualifyingStreaks (cases 9,10)', () => {
  // Use a routine scheduled every day, and selectively complete days.
  const r = [routine('r1')];

  it('§3 worked example: D1 Q, D2 N, D3 Q, D4 MISS, D5 Q, D6 Q -> current 2, best 2', () => {
    // We need D2 to be NEUTRAL (nothing scheduled). Model two routines:
    //  rAll: every day (makes a day MISS/QUALIFY), rGap used to force NEUTRAL via
    //  scheduling. Simpler: use a routine with repeatDays excluding D2.
    // D1..D6 = 2025-06-01 .. 2025-06-06. Weekdays:
    //  06-01 Sun(0), 06-02 Mon(1), 06-03 Tue(2), 06-04 Wed(3), 06-05 Thu(4), 06-06 Fri(5)
    // Schedule routine on all weekdays EXCEPT Monday(1) so D2 is NEUTRAL.
    const routines = [routine('r1', { repeatDays: [0, 2, 3, 4, 5] })];
    const today = '2025-06-06';
    // completed on D1, D3, D5, D6 (not D4 -> MISS)
    const comps = completedFor(['2025-06-01', '2025-06-03', '2025-06-05', '2025-06-06'], ['r1']);
    const { current, best } = qualifyingStreaks(routines, comps, today, STREAK_LOOKBACK_DAYS);
    expect(current).toBe(2); // D5,D6
    expect(best).toBe(2); // D1->D3 bridging D2, or D5->D6
  });

  it('guard: feeding the same qualifying keys to legacy computeStreak gives a WRONG answer when NEUTRAL intervenes', () => {
    // Qualifying days D1,D3 with NEUTRAL D2 bridging should be a run of 2.
    // computeStreak over just [D3,D1] walking back from D3 stops at D2 (missing) -> 1.
    const today = '2025-06-03';
    const qualifyingKeys = ['2025-06-01', '2025-06-03'];
    expect(computeStreak(qualifyingKeys, new Date(2025, 5, 3))).toBe(1); // wrong for our semantics
    // our scan bridges the neutral day:
    const routines = [routine('r1', { repeatDays: [0, 2, 3, 4, 5] })]; // skip Monday(06-02)
    const comps = completedFor(qualifyingKeys, ['r1']);
    const { current } = qualifyingStreaks(routines, comps, today, STREAK_LOOKBACK_DAYS);
    expect(current).toBe(2);
  });

  it('NEUTRAL bridge: Q,N,Q -> run 2 (not 1, not 3)', () => {
    const routines = [routine('r1', { repeatDays: [0, 2, 3, 4, 5] })]; // Monday neutral
    const today = '2025-06-03';
    const comps = completedFor(['2025-06-01', '2025-06-03'], ['r1']);
    const { current, best } = qualifyingStreaks(routines, comps, today, STREAK_LOOKBACK_DAYS);
    expect(current).toBe(2);
    expect(best).toBe(2);
  });

  it('NEUTRAL bridge: Q,N,N,Q -> run 2', () => {
    // schedule only on Sun(0) and Wed(3): 06-01 Sun Q, 06-02/06-03 neutral, 06-04 Wed Q
    const routines = [routine('r1', { repeatDays: [0, 3] })];
    const today = '2025-06-04';
    const comps = completedFor(['2025-06-01', '2025-06-04'], ['r1']);
    const { current, best } = qualifyingStreaks(routines, comps, today, STREAK_LOOKBACK_DAYS);
    expect(current).toBe(2);
    expect(best).toBe(2);
  });

  it('NEUTRAL immediately after a MISS does not revive the broken run', () => {
    // r on Sun(0) and Tue(2) and Wed(3): 06-01 Sun, 06-03 Tue, 06-04 Wed. 06-02 Mon neutral.
    // Make 06-01 a MISS (no record), 06-02 neutral, 06-03 Q, 06-04 Q.
    const routines = [routine('r1', { repeatDays: [0, 2, 3] })];
    const today = '2025-06-04';
    const comps = completedFor(['2025-06-03', '2025-06-04'], ['r1']);
    const { current, best } = qualifyingStreaks(routines, comps, today, STREAK_LOOKBACK_DAYS);
    expect(current).toBe(2); // 06-03, 06-04
    expect(best).toBe(2);
  });

  it('today incomplete still shows yesterdays streak via yesterday anchor', () => {
    const r2 = [routine('r1')]; // every day
    const today = '2025-06-10';
    // completed 06-08, 06-09 but NOT today
    const comps = completedFor(['2025-06-08', '2025-06-09'], ['r1']);
    const { current } = qualifyingStreaks(r2, comps, today, STREAK_LOOKBACK_DAYS);
    expect(current).toBe(2);
  });

  it('a MISS day resets current when walking back', () => {
    const r2 = [routine('r1')]; // every day
    const today = '2025-06-10';
    // today complete, yesterday complete, 06-08 MISS
    const comps = completedFor(['2025-06-10', '2025-06-09'], ['r1']);
    const { current } = qualifyingStreaks(r2, comps, today, STREAK_LOOKBACK_DAYS);
    expect(current).toBe(2); // 06-10, 06-09, stop at 06-08 miss
  });
});

// =========================================================================
// Case 11: duplicate-prevention idempotency (deterministic completion id)
// =========================================================================

describe('duplicate-prevention (case 11)', () => {
  it('two completed records for the same day+routine count once', () => {
    const r = [routine('r1')];
    const today = '2025-06-30';
    // same completion id twice (merge-set would collapse these; count by set)
    const comps = [completion('2025-06-10', 'r1'), completion('2025-06-10', 'r1')];
    const days = buildMonthDays(r, comps, 2025, 6, today);
    const d = days.find((x) => x.dateKey === '2025-06-10')!;
    expect(d.completed).toBe(1);
    expect(d.state).toBe('full');
  });
});

// =========================================================================
// Case 12 & 13: timezone/midnight local-day mapping + createdAt branches
// =========================================================================

describe('local-day mapping + createdAtLocalDay branches (cases 12,13)', () => {
  it('fmt uses local components, not UTC (near-midnight local date preserved)', () => {
    // 2025-06-10 23:30 local
    const d = new Date(2025, 5, 10, 23, 30, 0);
    expect(fmt(d)).toBe('2025-06-10');
  });

  it('createdAtLocalDay: Firestore Timestamp via toDate() near local midnight', () => {
    const localMidnightish = new Date(2025, 5, 10, 23, 45);
    const ts = { toDate: () => localMidnightish };
    expect(createdAtLocalDay(ts, '2000-01-01')).toBe('2025-06-10');
  });

  it('createdAtLocalDay: yyyy-MM-dd string used directly', () => {
    expect(createdAtLocalDay('2025-06-10', '2000-01-01')).toBe('2025-06-10');
  });

  it('createdAtLocalDay: missing/null -> windowStart', () => {
    expect(createdAtLocalDay(undefined, '2025-01-01')).toBe('2025-01-01');
    expect(createdAtLocalDay(null, '2025-01-01')).toBe('2025-01-01');
  });

  it('createdAtLocalDay: {seconds} plain object reconstructed', () => {
    const secs = Math.floor(new Date(2025, 5, 10, 12, 0).getTime() / 1000);
    expect(createdAtLocalDay({ seconds: secs }, '2000-01-01')).toBe('2025-06-10');
    expect(createdAtLocalDay({ _seconds: secs }, '2000-01-01')).toBe('2025-06-10');
  });

  it('createdAtLocalDay: unrecognized shape -> windowStart, never throws', () => {
    expect(createdAtLocalDay(12345, '2025-02-02')).toBe('2025-02-02');
    expect(createdAtLocalDay(true, '2025-02-02')).toBe('2025-02-02');
    expect(createdAtLocalDay({ foo: 'bar' }, '2025-02-02')).toBe('2025-02-02');
    expect(createdAtLocalDay('not-a-date', '2025-02-02')).toBe('2025-02-02');
  });

  it('createdAtLocalDay: Timestamp whose toDate throws -> windowStart', () => {
    const bad = { toDate: () => { throw new Error('boom'); } };
    expect(createdAtLocalDay(bad, '2025-03-03')).toBe('2025-03-03');
  });
});

// =========================================================================
// Case 13(a): createdAt carve-out — new routine not required on past days
// =========================================================================

describe('createdAt carve-out (case 13a)', () => {
  const today = '2025-06-30';

  it('routine created today is NOT required on a past day -> past day NOT retroactively missed', () => {
    const r = [routine('r1', { createdAt: '2025-06-30' })];
    // 2025-06-10 is before the routine existed
    const days = buildMonthDays(r, [], 2025, 6, today);
    expect(days.find((x) => x.dateKey === '2025-06-10')!.state).toBe('none');
    expect(classifyDay(r, [], '2025-06-10', today)).toBe('NEUTRAL');
  });

  it('legacy routine with missing createdAt IS required on past days (breaks streak)', () => {
    const r = [routine('r1', { createdAt: undefined })];
    expect(classifyDay(r, [], '2025-06-10', today, '2025-01-01')).toBe('MISS');
  });
});

// =========================================================================
// Case 14: empty month / no goals
// =========================================================================

describe('empty month / no goals (case 14)', () => {
  it('no routines -> all days none, streak 0', () => {
    const days = buildMonthDays([], [], 2025, 6, '2025-06-15');
    expect(days.every((d) => d.state === 'none')).toBe(true);
    const { current, best } = qualifyingStreaks([], [], '2025-06-15');
    expect(current).toBe(0);
    expect(best).toBe(0);
  });
});

// =========================================================================
// Case 16: edit-affects-history retroactive recompute
// =========================================================================

describe('edit-affects-history retroactive recompute (case 16)', () => {
  const today = '2025-06-30';

  it('changing repeatDays so a past day becomes scheduled flips it to missed', () => {
    // 2025-06-03 is a Tuesday(2). Before: scheduled Mon only -> neutral.
    const before = [routine('r1', { repeatDays: [1], createdAt: '2025-05-01' })];
    expect(classifyDay(before, [], '2025-06-03', today)).toBe('NEUTRAL');
    // After: now scheduled every day; no completed record -> MISS.
    const after = [routine('r1', { repeatDays: [], createdAt: '2025-05-01' })];
    expect(classifyDay(after, [], '2025-06-03', today)).toBe('MISS');
    const days = buildMonthDays(after, [], 2025, 6, today);
    expect(days.find((x) => x.dateKey === '2025-06-03')!.state).toBe('missed');
  });

  it('carve-out still prevents reaching days before createdAt after an edit', () => {
    const after = [routine('r1', { repeatDays: [], createdAt: '2025-06-15' })];
    // 2025-06-03 is before createdAt -> still neutral despite every-day schedule
    expect(classifyDay(after, [], '2025-06-03', today, '2025-01-01')).toBe('NEUTRAL');
  });
});

// =========================================================================
// Case 17: shared required-set helper agreement
// =========================================================================

describe('requiredRoutinesForDay shared agreement (case 17)', () => {
  it('routine created today is excluded from a past days required set', () => {
    const r = [routine('r1', { createdAt: '2025-06-30' })];
    const req = requiredRoutinesForDay(r, '2025-06-10', '2025-06-01');
    expect(req.length).toBe(0);
  });

  it('every-day routine that existed is in the required set', () => {
    const r = [routine('r1', { createdAt: '2025-01-01' })];
    const req = requiredRoutinesForDay(r, '2025-06-10', '2025-06-01');
    expect(req.map((x) => x.id)).toEqual(['r1']);
  });

  it('disabled routine is excluded', () => {
    const r = [routine('r1', { enabled: false })];
    expect(requiredRoutinesForDay(r, '2025-06-10').length).toBe(0);
  });
});

// =========================================================================
// STREAK_LOOKBACK_DAYS constant
// =========================================================================

describe('STREAK_LOOKBACK_DAYS', () => {
  it('is 366', () => {
    expect(STREAK_LOOKBACK_DAYS).toBe(366);
  });
});

// =========================================================================
// Case 15: bounded read count (service-level, mocked repository)
// =========================================================================

describe('getMonth bounded read count (case 15)', () => {
  it('performs exactly 1 list + 2 range reads, no per-day fan-out', async () => {
    vi.resetModules();
    const list = vi.fn().mockResolvedValue([]);
    const listCompletionsInRange = vi.fn().mockResolvedValue([]);
    const listCompletionsByDate = vi.fn().mockResolvedValue([]);

    vi.doMock('../repositories/routineRepository.js', () => ({
      routineRepository: { list, listCompletionsInRange, listCompletionsByDate },
    }));
    vi.doMock('../config/firebase.js', () => ({
      admin: { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } },
    }));

    const { routineService } = await import('../services/routineService.js');

    // current month
    await routineService.getMonth('uid1', 2025, 6);
    expect(list).toHaveBeenCalledTimes(1);
    expect(listCompletionsInRange).toHaveBeenCalledTimes(2);
    expect(listCompletionsByDate).not.toHaveBeenCalled();

    list.mockClear();
    listCompletionsInRange.mockClear();

    // far-past month (two non-overlapping range reads still = 2)
    await routineService.getMonth('uid1', 2010, 1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(listCompletionsInRange).toHaveBeenCalledTimes(2);

    vi.resetModules();
    vi.doUnmock('../repositories/routineRepository.js');
    vi.doUnmock('../config/firebase.js');
  });
});

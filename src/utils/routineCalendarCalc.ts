import { completionPercent, isRoutineOnDate } from './routineCalc.js';

/**
 * Pure (no-I/O) calendar + routine-streak calculation helpers.
 *
 * Correctness rules live here and here only (design §2 incl Finding #1, §3
 * strict NEUTRAL-aware streak, §4 local-day). All dateKeys are local
 * `yyyy-MM-dd` strings; nothing in this module ever uses UTC (`toISOString`).
 *
 * The legacy `computeStreak` (streakCalc.ts) is intentionally NOT used for the
 * routine streak — it stops at the first missing dateKey and would break on a
 * rest/NEUTRAL day. `qualifyingStreaks` below is the dedicated NEUTRAL-aware
 * scan.
 */

/** Lookback window for the routine streak: a full year incl. a leap day. */
export const STREAK_LOOKBACK_DAYS = 366;

type RoutineLike = Record<string, unknown>;
type CompletionLike = Record<string, unknown>;

/** The three-state classification a server day maps to (plus FUTURE). */
export type StreakClass = 'QUALIFYING' | 'NEUTRAL' | 'MISS' | 'FUTURE';

/** The per-day aggregate state returned to the client. */
export type ServerDayState = 'full' | 'partial' | 'missed' | 'none';

export interface MonthDay {
  dateKey: string;
  total: number;
  completed: number;
  completionPercent: number;
  state: ServerDayState;
}

export interface StreakResult {
  current: number;
  best: number;
}

/**
 * Server-local date formatter → `yyyy-MM-dd`. Uses local getFullYear/getMonth/
 * getDate (never toISOString) so the local day is preserved near midnight.
 */
export function fmt(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

/**
 * Start/end dateKeys for a calendar month, leap-year aware.
 * `month` is 1-based (1=Jan..12=Dec). The last day is derived with
 * `new Date(year, month, 0).getDate()` (day 0 of the next month).
 */
export function monthBounds(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate();
  const mm = month.toString().padStart(2, '0');
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${lastDay.toString().padStart(2, '0')}`,
  };
}

const DATEKEY_RE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Derives a routine's creation local-day as a `yyyy-MM-dd` string. Handles
 * EXACTLY these cases and NEVER throws (design §2, Finding #4):
 *  1. Firestore Timestamp (callable `.toDate()`) → local fmt of that date.
 *  2. `yyyy-MM-dd` string → used directly.
 *  3. missing / null / undefined → `windowStart` (legacy doc assumed to have
 *     always existed → IS required on past days).
 *  4. any other shape → `windowStart`. A plain `{seconds}`/`{_seconds}` object
 *     MAY be reconstructed via `new Date(seconds * 1000)` and formatted locally.
 */
export function createdAtLocalDay(createdAt: unknown, windowStart: string): string {
  if (createdAt == null) return windowStart;

  // 1. Firestore Timestamp (has a callable toDate()).
  if (typeof (createdAt as { toDate?: unknown }).toDate === 'function') {
    try {
      const d = (createdAt as { toDate: () => Date }).toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return fmt(d);
    } catch {
      return windowStart;
    }
    return windowStart;
  }

  // 2. yyyy-MM-dd string.
  if (typeof createdAt === 'string') {
    return DATEKEY_RE.test(createdAt) ? createdAt : windowStart;
  }

  // 4a. Native Date.
  if (createdAt instanceof Date) {
    return Number.isNaN(createdAt.getTime()) ? windowStart : fmt(createdAt);
  }

  // 4b. Timestamp-like plain object { seconds | _seconds }.
  if (typeof createdAt === 'object') {
    const obj = createdAt as { seconds?: unknown; _seconds?: unknown };
    const seconds = typeof obj.seconds === 'number' ? obj.seconds : obj._seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      const d = new Date(seconds * 1000);
      if (!Number.isNaN(d.getTime())) return fmt(d);
    }
  }

  // 4c. Anything else (number, boolean, unrecognized) → safe fallback.
  return windowStart;
}

/**
 * The required set for a day: routines that are scheduled AND active AND
 * already existed on/before that day (design §2 three-conjunct predicate).
 * Shared by `getDay` (day-detail list) and `buildMonthDays` (calendar) so they
 * can never diverge (design §6.1, Finding #2).
 *
 * `windowStart` bounds the legacy/missing-createdAt fallback; pass the earliest
 * key being evaluated (the day itself is a safe default for a single-day call).
 */
export function requiredRoutinesForDay(
  routines: RoutineLike[],
  dateKey: string,
  windowStart: string = dateKey,
): RoutineLike[] {
  return routines.filter(
    (r) =>
      (r.enabled as boolean) !== false &&
      isRoutineOnDate((r.repeatDays as number[]) ?? [], dateKey) &&
      createdAtLocalDay(r.createdAt, windowStart) <= dateKey,
  );
}

/**
 * Builds the set of routineIds that have a `completed` record for a dateKey.
 */
function completedRoutineIds(completions: CompletionLike[], dateKey: string): Set<string> {
  const ids = new Set<string>();
  for (const c of completions) {
    if ((c.dateKey as string) === dateKey && (c.status as string) === 'completed') {
      ids.add(c.routineId as string);
    }
  }
  return ids;
}

/**
 * Classifies a day into one of QUALIFYING / NEUTRAL / MISS / FUTURE (design §2).
 *  - FUTURE (dateKey > today): always FUTURE, even if a stray record exists.
 *  - NEUTRAL: required set empty (nothing scheduled).
 *  - QUALIFYING: required set non-empty AND every required routine has a
 *    'completed' record.
 *  - MISS: required set non-empty AND ≥1 required routine lacks a 'completed'
 *    record (absent / pending / skipped). `today` in-progress is NOT a MISS —
 *    an incomplete today classifies as NEUTRAL-for-streak purposes here is NOT
 *    used; see note below.
 *
 * Note on today: a non-fully-complete `today` must never break a streak. We
 * encode that by returning MISS only when the day has ENDED (`dateKey < today`).
 * For `dateKey == today` an incomplete required set returns NEUTRAL (does not
 * extend, does not break), while a fully-complete today returns QUALIFYING.
 */
export function classifyDay(
  routines: RoutineLike[],
  completions: CompletionLike[],
  dateKey: string,
  today: string,
  windowStart: string = dateKey,
): StreakClass {
  if (dateKey > today) return 'FUTURE';

  const required = requiredRoutinesForDay(routines, dateKey, windowStart);
  if (required.length === 0) return 'NEUTRAL';

  const completedIds = completedRoutineIds(completions, dateKey);
  const allCompleted = required.every((r) => completedIds.has(r.id as string));
  if (allCompleted) return 'QUALIFYING';

  // Non-empty required set, not all completed.
  if (dateKey === today) return 'NEUTRAL'; // today in progress: never a miss, never qualifying
  return 'MISS';
}

/**
 * Builds the per-day aggregate state array for a requested month (design §6.2).
 * `state` is the server-side ∈ {full, partial, missed, none}; the client layers
 * temporal (today/future) and selection on top.
 */
export function buildMonthDays(
  routines: RoutineLike[],
  completions: CompletionLike[],
  year: number,
  month: number,
  today: string,
): MonthDay[] {
  const lastDay = new Date(year, month, 0).getDate();
  const mm = month.toString().padStart(2, '0');
  const windowStart = `${year}-${mm}-01`;
  const days: MonthDay[] = [];

  for (let day = 1; day <= lastDay; day += 1) {
    const dateKey = `${year}-${mm}-${day.toString().padStart(2, '0')}`;
    const required = requiredRoutinesForDay(routines, dateKey, windowStart);
    const total = required.length;
    const completedIds = completedRoutineIds(completions, dateKey);
    const completed = required.filter((r) => completedIds.has(r.id as string)).length;

    let state: ServerDayState;
    if (total === 0) {
      state = 'none';
    } else if (dateKey > today) {
      // Future: never green, never missed, even if a stray completed record
      // exists. The client renders future as disabled regardless.
      state = 'none';
    } else if (completed >= total) {
      state = 'full';
    } else if (completed > 0) {
      state = 'partial';
    } else {
      // Zero completed on a scheduled day: missed if ended, else partial-for-today.
      state = dateKey < today ? 'missed' : 'partial';
    }

    // A past partial is semantically a miss; the mapping table (§6.2) renders a
    // past 'partial' as grey. We keep 'partial' here so the client can tint it,
    // but ensure an ENDED non-full scheduled day is never 'none'/'full'.

    days.push({
      dateKey,
      total,
      completed,
      completionPercent: completionPercent(total, completed),
      state,
    });
  }

  return days;
}

/** Adds `n` days to a `yyyy-MM-dd` key using local calendar arithmetic. */
function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d + n);
  return fmt(dt);
}

/**
 * Dedicated NEUTRAL-aware routine-streak scan (design §3). NOT `computeStreak`.
 *
 *  - QUALIFYING → run += 1
 *  - NEUTRAL    → no-op (bridges rest days; neither extends nor breaks)
 *  - MISS       → run resets to 0
 *  - FUTURE     → ignored (never reached in the window, which ends at `today`)
 *
 * current: walk backward from an anchor (today if today is QUALIFYING, else
 *   yesterday) until a MISS stops it. best: forward pass max over the window.
 */
export function qualifyingStreaks(
  routines: RoutineLike[],
  completions: CompletionLike[],
  today: string,
  lookbackDays: number = STREAK_LOOKBACK_DAYS,
): StreakResult {
  const windowStart = addDays(today, -(lookbackDays - 1));

  // Classify every day in the window once, oldest → newest.
  const classes: { dateKey: string; cls: StreakClass }[] = [];
  let cursor = windowStart;
  while (cursor <= today) {
    classes.push({ dateKey: cursor, cls: classifyDay(routines, completions, cursor, today, windowStart) });
    cursor = addDays(cursor, 1);
  }

  // Best: forward pass.
  let best = 0;
  let run = 0;
  for (const { cls } of classes) {
    if (cls === 'QUALIFYING') {
      run += 1;
      if (run > best) best = run;
    } else if (cls === 'MISS') {
      run = 0;
    }
    // NEUTRAL / FUTURE: no-op (bridge).
  }

  // Current: walk backward from the anchor.
  // Anchor = today if today QUALIFYING, else yesterday.
  const byKey = new Map<string, StreakClass>();
  for (const { dateKey, cls } of classes) byKey.set(dateKey, cls);

  let current = 0;
  const todayCls = byKey.get(today) ?? 'NEUTRAL';
  let walk = todayCls === 'QUALIFYING' ? today : addDays(today, -1);
  while (walk >= windowStart) {
    const cls = byKey.get(walk);
    if (cls === 'MISS') break;
    if (cls === 'QUALIFYING') current += 1;
    // NEUTRAL: bridge, keep walking.
    walk = addDays(walk, -1);
  }

  return { current, best };
}

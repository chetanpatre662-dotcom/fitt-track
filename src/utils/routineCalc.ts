/**
 * Returns the weekday index (0=Sun..6=Sat) for a yyyy-MM-dd date key,
 * interpreted in local time.
 */
export function weekdayForDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d).getDay();
}

/** Whether a routine (by its repeatDays) is scheduled on the given date. */
export function isRoutineOnDate(repeatDays: number[], dateKey: string): boolean {
  if (!repeatDays || repeatDays.length === 0) return true; // no repeat = every day
  return repeatDays.includes(weekdayForDateKey(dateKey));
}

/** Completion percentage (0-100) for a set of routines given completion statuses. */
export function completionPercent(
  scheduledCount: number,
  completedCount: number,
): number {
  if (scheduledCount <= 0) return 0;
  return Math.round((completedCount / scheduledCount) * 100);
}

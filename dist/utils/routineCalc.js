"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.weekdayForDateKey = weekdayForDateKey;
exports.isRoutineOnDate = isRoutineOnDate;
exports.completionPercent = completionPercent;
/**
 * Returns the weekday index (0=Sun..6=Sat) for a yyyy-MM-dd date key,
 * interpreted in local time.
 */
function weekdayForDateKey(dateKey) {
    const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
    return new Date(y, m - 1, d).getDay();
}
/** Whether a routine (by its repeatDays) is scheduled on the given date. */
function isRoutineOnDate(repeatDays, dateKey) {
    if (!repeatDays || repeatDays.length === 0)
        return true; // no repeat = every day
    return repeatDays.includes(weekdayForDateKey(dateKey));
}
/** Completion percentage (0-100) for a set of routines given completion statuses. */
function completionPercent(scheduledCount, completedCount) {
    if (scheduledCount <= 0)
        return 0;
    return Math.round((completedCount / scheduledCount) * 100);
}
//# sourceMappingURL=routineCalc.js.map
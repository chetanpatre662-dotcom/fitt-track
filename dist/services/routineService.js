"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routineService = exports.RoutineService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const routineRepository_js_1 = require("../repositories/routineRepository.js");
const errors_js_1 = require("../utils/errors.js");
const routineCalc_js_1 = require("../utils/routineCalc.js");
const routineCalendarCalc_js_1 = require("../utils/routineCalendarCalc.js");
class RoutineService {
    async list(uid) {
        return routineRepository_js_1.routineRepository.list(uid);
    }
    async create(uid, input) {
        const id = routineRepository_js_1.routineRepository.newId(uid);
        return routineRepository_js_1.routineRepository.set(uid, id, {
            ...input,
            description: input.description ?? null,
            createdAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    async update(uid, id, input) {
        const existing = await routineRepository_js_1.routineRepository.get(uid, id);
        if (!existing)
            throw new errors_js_1.NotFoundError('Routine not found');
        return routineRepository_js_1.routineRepository.set(uid, id, { ...input, description: input.description ?? null });
    }
    async delete(uid, id) {
        const existing = await routineRepository_js_1.routineRepository.get(uid, id);
        if (!existing)
            throw new errors_js_1.NotFoundError('Routine not found');
        await routineRepository_js_1.routineRepository.delete(uid, id);
        // Hard-delete the definition only. Completion history is intentionally
        // PRESERVED so past days' calendar state + the streak stay correct
        // (design §9). `deleteCompletionsForRoutine` remains for account-wipe.
    }
    async setCompletion(uid, id, dateKey, status) {
        const existing = await routineRepository_js_1.routineRepository.get(uid, id);
        if (!existing)
            throw new errors_js_1.NotFoundError('Routine not found');
        return routineRepository_js_1.routineRepository.setCompletion(uid, dateKey, id, status);
    }
    /**
     * Returns the routines scheduled for a given date with their completion
     * status, plus the day's completion percentage.
     */
    async getDay(uid, dateKey) {
        const [routines, completions] = await Promise.all([
            routineRepository_js_1.routineRepository.list(uid),
            routineRepository_js_1.routineRepository.listCompletionsByDate(uid, dateKey),
        ]);
        const statusByRoutine = new Map();
        for (const c of completions) {
            statusByRoutine.set(c.routineId, c.status ?? 'pending');
        }
        // Filter the task list through the shared required-set helper so the
        // day-detail list gains the createdAt<=dateKey carve-out and can never
        // diverge from the calendar aggregator (design §6.1, Finding #2).
        const scheduled = (0, routineCalendarCalc_js_1.requiredRoutinesForDay)(routines, dateKey).map((r) => ({
            ...r,
            status: statusByRoutine.get(r.id) ?? 'pending',
        }));
        const completedCount = scheduled.filter((r) => r.status === 'completed').length;
        return {
            dateKey,
            routines: scheduled,
            total: scheduled.length,
            completed: completedCount,
            completionPercent: (0, routineCalc_js_1.completionPercent)(scheduled.length, completedCount),
        };
    }
    /**
     * Per-day aggregate state for a month + the current/best routine streak.
     * Bounded to <=3 Firestore reads (design §6): 1 × list + 2 × range reads
     * (one for the month grid, one for the 366-day streak window). No per-day
     * `getDay` fan-out.
     */
    async getMonth(uid, year, month) {
        const { start, end } = (0, routineCalendarCalc_js_1.monthBounds)(year, month);
        // Server-local today for past/present/future classification.
        const today = (0, routineCalendarCalc_js_1.fmt)(new Date());
        // Streak window start = today - (lookback - 1) days (local arithmetic).
        const windowStartDate = new Date();
        windowStartDate.setDate(windowStartDate.getDate() - (routineCalendarCalc_js_1.STREAK_LOOKBACK_DAYS - 1));
        const windowStart = (0, routineCalendarCalc_js_1.fmt)(windowStartDate);
        const [routines, monthCompletions, streakCompletions] = await Promise.all([
            routineRepository_js_1.routineRepository.list(uid),
            routineRepository_js_1.routineRepository.listCompletionsInRange(uid, start, end),
            routineRepository_js_1.routineRepository.listCompletionsInRange(uid, windowStart, today),
        ]);
        const days = (0, routineCalendarCalc_js_1.buildMonthDays)(routines, monthCompletions, year, month, today);
        const streak = (0, routineCalendarCalc_js_1.qualifyingStreaks)(routines, streakCompletions, today, routineCalendarCalc_js_1.STREAK_LOOKBACK_DAYS);
        return { year, month, days, streak };
    }
}
exports.RoutineService = RoutineService;
exports.routineService = new RoutineService();
//# sourceMappingURL=routineService.js.map
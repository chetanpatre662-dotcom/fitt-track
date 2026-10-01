"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routineService = exports.RoutineService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const routineRepository_js_1 = require("../repositories/routineRepository.js");
const errors_js_1 = require("../utils/errors.js");
const routineCalc_js_1 = require("../utils/routineCalc.js");
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
        // Clean up completion history so no stale records linger.
        await routineRepository_js_1.routineRepository.deleteCompletionsForRoutine(uid, id);
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
        const scheduled = routines
            .filter((r) => r.enabled !== false)
            .filter((r) => (0, routineCalc_js_1.isRoutineOnDate)(r.repeatDays ?? [], dateKey))
            .map((r) => ({
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
}
exports.RoutineService = RoutineService;
exports.routineService = new RoutineService();
//# sourceMappingURL=routineService.js.map
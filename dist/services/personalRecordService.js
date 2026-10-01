"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.personalRecordService = exports.PersonalRecordService = void 0;
const personalRecordRepository_js_1 = require("../repositories/personalRecordRepository.js");
const prCalc_js_1 = require("../utils/prCalc.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Detects and persists personal records after a workout is completed.
 * Returns the list of NEW records so the caller can surface a notification.
 * Never throws to the caller path — PR detection is best-effort and must not
 * block workout completion.
 */
class PersonalRecordService {
    async detectAndRecord(uid, workoutId, exercises) {
        const newPrs = [];
        try {
            const candidates = (0, prCalc_js_1.derivePrCandidates)(exercises);
            for (const c of candidates) {
                const existing = await personalRecordRepository_js_1.personalRecordRepository.getBest(uid, c.exerciseId, c.recordType);
                const prevValue = existing?.value ?? null;
                if ((0, prCalc_js_1.isNewRecord)(c.value, prevValue)) {
                    const record = {
                        exerciseId: c.exerciseId,
                        recordType: c.recordType,
                        value: c.value,
                        reps: c.reps ?? null,
                        weightKg: c.weightKg ?? null,
                        workoutId,
                    };
                    await personalRecordRepository_js_1.personalRecordRepository.upsertBest(uid, record);
                    newPrs.push({
                        exerciseId: c.exerciseId,
                        recordType: c.recordType,
                        value: c.value,
                        previousValue: prevValue,
                    });
                }
            }
        }
        catch (err) {
            logger_js_1.logger.warn({ err, uid, workoutId }, 'PR detection failed (non-fatal)');
        }
        return newPrs;
    }
    async listAll(uid) {
        return personalRecordRepository_js_1.personalRecordRepository.listAll(uid);
    }
    async listForExercise(uid, exerciseId) {
        return personalRecordRepository_js_1.personalRecordRepository.listForExercise(uid, exerciseId);
    }
}
exports.PersonalRecordService = PersonalRecordService;
exports.personalRecordService = new PersonalRecordService();
//# sourceMappingURL=personalRecordService.js.map
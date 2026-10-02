"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.measurementService = exports.MeasurementService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const measurementRepository_js_1 = require("../repositories/measurementRepository.js");
/**
 * Body-measurement history. Appends dated height/weight records (never
 * overwrites) so the Progress report can show trends over time.
 *
 * `type: 'body'` is stamped so the existing (type, measuredAt) composite index
 * is used and future measurement types can coexist.
 */
class MeasurementService {
    async add(uid, input) {
        const id = measurementRepository_js_1.measurementRepository.newId(uid);
        const measuredAt = input.measuredAt ? new Date(input.measuredAt) : new Date();
        return measurementRepository_js_1.measurementRepository.add(uid, id, {
            type: 'body',
            measuredAt: firebase_js_1.admin.firestore.Timestamp.fromDate(measuredAt),
            heightCm: input.heightCm,
            weightKg: input.weightKg,
            note: input.note ?? null,
        });
    }
    async list(uid) {
        const rows = await measurementRepository_js_1.measurementRepository.list(uid);
        // Normalize measuredAt to ISO for the client.
        return rows.map((r) => ({
            ...r,
            measuredAt: toIso(r.measuredAt),
        }));
    }
}
exports.MeasurementService = MeasurementService;
function toIso(value) {
    const t = value;
    if (t && typeof t.toDate === 'function')
        return t.toDate().toISOString();
    if (typeof value === 'string')
        return value;
    return null;
}
exports.measurementService = new MeasurementService();
//# sourceMappingURL=measurementService.js.map
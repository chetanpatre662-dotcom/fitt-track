"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waterService = exports.WaterService = void 0;
const waterRepository_js_1 = require("../repositories/waterRepository.js");
const errors_js_1 = require("../utils/errors.js");
class WaterService {
    /** Returns the day's water entries and the total consumed in ml. */
    async getDay(uid, dateKey) {
        const rows = await waterRepository_js_1.waterRepository.listByDate(uid, dateKey);
        const entries = rows.map((r) => ({
            id: r.id,
            amountMl: r.amountMl ?? 0,
        }));
        const totalMl = entries.reduce((sum, e) => sum + e.amountMl, 0);
        return { dateKey, entries, totalMl };
    }
    async add(uid, input) {
        return waterRepository_js_1.waterRepository.add(uid, { dateKey: input.dateKey, amountMl: input.amountMl });
    }
    async delete(uid, id) {
        const existing = await waterRepository_js_1.waterRepository.get(uid, id);
        if (!existing)
            throw new errors_js_1.NotFoundError('Water entry not found');
        await waterRepository_js_1.waterRepository.delete(uid, id);
    }
}
exports.WaterService = WaterService;
exports.waterService = new WaterService();
//# sourceMappingURL=waterService.js.map
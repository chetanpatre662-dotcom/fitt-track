"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.measurementCreateSchema = void 0;
const zod_1 = require("zod");
/**
 * A body-measurement record. `measuredAt` is an ISO timestamp (defaults to now
 * server-side when omitted). height/weight match the profile's unit ranges.
 */
exports.measurementCreateSchema = zod_1.z.object({
    measuredAt: zod_1.z.string().datetime({ offset: true }).optional(),
    heightCm: zod_1.z.number().min(80).max(260),
    weightKg: zod_1.z.number().min(25).max(400),
    note: zod_1.z.string().max(200).nullable().optional(),
});
//# sourceMappingURL=measurementValidators.js.map
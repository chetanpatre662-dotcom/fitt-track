"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waterIdParamsSchema = exports.waterDayQuerySchema = exports.waterAddSchema = void 0;
const zod_1 = require("zod");
const validate_js_1 = require("../middleware/validate.js");
exports.waterAddSchema = zod_1.z.object({
    dateKey: validate_js_1.commonSchemas.dateKey,
    amountMl: zod_1.z.number().int().min(1).max(5000),
});
exports.waterDayQuerySchema = zod_1.z.object({
    date: validate_js_1.commonSchemas.dateKey.optional(),
});
exports.waterIdParamsSchema = zod_1.z.object({ id: zod_1.z.string().min(1).max(200) });
//# sourceMappingURL=waterValidators.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fcmTokenSchema = void 0;
const zod_1 = require("zod");
exports.fcmTokenSchema = zod_1.z.object({
    token: zod_1.z.string().min(1).max(4096),
});
//# sourceMappingURL=notificationValidators.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.progressPhotoIdParamsSchema = exports.progressPhotoCreateSchema = exports.PHOTO_CATEGORIES = void 0;
const zod_1 = require("zod");
/**
 * Allowed muscle/body categories for a progress photo. The seven presets plus
 * a `custom` sentinel: when `category === 'custom'` the request MUST carry a
 * non-empty `customLabel` free-text name (see schema below).
 */
exports.PHOTO_CATEGORIES = [
    'chest',
    'back',
    'shoulders',
    'arms',
    'legs',
    'abs',
    'full_body',
    'custom',
];
/**
 * Progress-photo metadata. The image itself is uploaded to Firebase Storage by
 * the authenticated client; `storagePath` references it (must live under the
 * caller's own users/{uid}/ prefix — enforced in the service).
 */
exports.progressPhotoCreateSchema = zod_1.z
    .object({
    storagePath: zod_1.z.string().min(1).max(500),
    category: zod_1.z.enum(exports.PHOTO_CATEGORIES),
    takenAt: zod_1.z.string().datetime({ offset: true }).optional(),
    caption: zod_1.z.string().max(200).nullable().optional(),
    // Free-text label; required when category === 'custom', ignored otherwise.
    customLabel: zod_1.z.string().min(1).max(40).optional(),
})
    .superRefine((val, ctx) => {
    if (val.category === 'custom' && (!val.customLabel || val.customLabel.trim().length === 0)) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['customLabel'],
            message: 'customLabel is required for a custom category.',
        });
    }
});
exports.progressPhotoIdParamsSchema = zod_1.z.object({ id: zod_1.z.string().min(1).max(200) });
//# sourceMappingURL=progressPhotoValidators.js.map
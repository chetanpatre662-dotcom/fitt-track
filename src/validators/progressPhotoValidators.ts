import { z } from 'zod';

/**
 * Allowed muscle/body categories for a progress photo. The seven presets plus
 * a `custom` sentinel: when `category === 'custom'` the request MUST carry a
 * non-empty `customLabel` free-text name (see schema below).
 */
export const PHOTO_CATEGORIES = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'abs',
  'full_body',
  'custom',
] as const;

/**
 * Progress-photo metadata. The image itself is uploaded to Firebase Storage by
 * the authenticated client; `storagePath` references it (must live under the
 * caller's own users/{uid}/ prefix — enforced in the service).
 */
export const progressPhotoCreateSchema = z
  .object({
    storagePath: z.string().min(1).max(500),
    category: z.enum(PHOTO_CATEGORIES),
    takenAt: z.string().datetime({ offset: true }).optional(),
    caption: z.string().max(200).nullable().optional(),
    // Free-text label; required when category === 'custom', ignored otherwise.
    customLabel: z.string().min(1).max(40).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.category === 'custom' && (!val.customLabel || val.customLabel.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customLabel'],
        message: 'customLabel is required for a custom category.',
      });
    }
  });

export const progressPhotoIdParamsSchema = z.object({ id: z.string().min(1).max(200) });

export type ProgressPhotoCreateInput = z.infer<typeof progressPhotoCreateSchema>;

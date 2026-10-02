import { z } from 'zod';

/** Allowed muscle/body categories for a progress photo (+ custom caption). */
export const PHOTO_CATEGORIES = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'abs',
  'full_body',
] as const;

/**
 * Progress-photo metadata. The image itself is uploaded to Firebase Storage by
 * the authenticated client; `storagePath` references it (must live under the
 * caller's own users/{uid}/ prefix — enforced in the service).
 */
export const progressPhotoCreateSchema = z.object({
  storagePath: z.string().min(1).max(500),
  category: z.enum(PHOTO_CATEGORIES),
  takenAt: z.string().datetime({ offset: true }).optional(),
  caption: z.string().max(200).nullable().optional(),
});

export const progressPhotoIdParamsSchema = z.object({ id: z.string().min(1).max(200) });

export type ProgressPhotoCreateInput = z.infer<typeof progressPhotoCreateSchema>;

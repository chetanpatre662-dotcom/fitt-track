import { z } from 'zod';

/**
 * A body-measurement record. `measuredAt` is an ISO timestamp (defaults to now
 * server-side when omitted). height/weight match the profile's unit ranges.
 */
export const measurementCreateSchema = z.object({
  measuredAt: z.string().datetime({ offset: true }).optional(),
  heightCm: z.number().min(80).max(260),
  weightKg: z.number().min(25).max(400),
  note: z.string().max(200).nullable().optional(),
});

export type MeasurementCreateInput = z.infer<typeof measurementCreateSchema>;

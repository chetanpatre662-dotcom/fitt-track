import { z } from 'zod';
import { commonSchemas } from '../middleware/validate.js';

export const waterAddSchema = z.object({
  dateKey: commonSchemas.dateKey,
  amountMl: z.number().int().min(1).max(5000),
});

export const waterDayQuerySchema = z.object({
  date: commonSchemas.dateKey.optional(),
});

export const waterIdParamsSchema = z.object({ id: z.string().min(1).max(200) });

export type WaterAddInput = z.infer<typeof waterAddSchema>;

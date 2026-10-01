import { z } from 'zod';
import { ROUTINE_CATEGORIES } from '../models/domain.js';
import { commonSchemas } from '../middleware/validate.js';

/** Create/update payload for a routine item. repeatDays: 0=Sun..6=Sat. */
export const routineUpsertSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  category: z.enum(ROUTINE_CATEGORIES),
  time: commonSchemas.timeOfDay,
  repeatDays: z.array(z.number().int().min(0).max(6)).max(7).default([0, 1, 2, 3, 4, 5, 6]),
  enabled: z.boolean().default(true),
  notificationEnabled: z.boolean().default(true),
});

export const routineCompleteSchema = z.object({
  dateKey: commonSchemas.dateKey,
  status: z.enum(['pending', 'completed', 'skipped']).default('completed'),
});

export const routineCompletionsQuerySchema = z.object({
  date: commonSchemas.dateKey.optional(),
});

export const routineIdParamsSchema = z.object({ id: z.string().min(1).max(200) });

export type RoutineUpsertInput = z.infer<typeof routineUpsertSchema>;
export type RoutineCompleteInput = z.infer<typeof routineCompleteSchema>;

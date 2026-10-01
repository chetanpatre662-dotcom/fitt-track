import { z } from 'zod';

export const rangeQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d', '1y', 'all']).default('30d'),
  limit: z.coerce.number().int().min(1).max(365).optional(),
});

export const exerciseProgressionQuerySchema = z.object({
  exerciseId: z.string().min(1).max(200),
  range: z.enum(['7d', '30d', '90d', '1y', 'all']).default('90d'),
});

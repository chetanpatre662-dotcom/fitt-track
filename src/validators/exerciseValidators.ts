import { z } from 'zod';
import {
  DIFFICULTIES,
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  WORKOUT_LOCATIONS,
} from '../models/domain.js';

/**
 * Query schema for GET /api/exercises. All filters are optional and combine
 * with AND. Values are coerced from query strings.
 */
export const exerciseListQuerySchema = z.object({
  location: z.enum(['all', ...WORKOUT_LOCATIONS]).optional(),
  muscle: z.enum(['all', ...MUSCLE_GROUPS]).optional(),
  equipment: z.enum(EQUIPMENT).optional(),
  difficulty: z.enum(['all', ...DIFFICULTIES]).optional(),
  type: z.enum(['all', ...EXERCISE_TYPES]).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const exerciseSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const exerciseIdParamsSchema = z.object({
  id: z.string().min(1).max(200),
});

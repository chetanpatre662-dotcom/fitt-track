import { z } from 'zod';
import { MEAL_TYPES } from '../models/domain.js';
import { commonSchemas } from '../middleware/validate.js';

/** A logged food entry. Macros are the totals for the logged quantity. */
export const foodLogUpsertSchema = z.object({
  dateKey: commonSchemas.dateKey,
  mealType: z.enum(MEAL_TYPES),
  name: z.string().min(1).max(120),
  foodId: z.string().max(200).nullable().optional(),
  servingSize: z.string().max(80).default('1 serving'),
  quantity: z.number().min(0.01).max(100).default(1),
  calories: z.number().min(0).max(20_000),
  protein: z.number().min(0).max(2000).default(0),
  carbs: z.number().min(0).max(2000).default(0),
  fat: z.number().min(0).max(2000).default(0),
  fiber: z.number().min(0).max(500).default(0),
  sugar: z.number().min(0).max(2000).default(0),
  sodium: z.number().min(0).max(100_000).default(0),
});

export const nutritionDayQuerySchema = z.object({
  date: commonSchemas.dateKey.optional(),
});

export const foodSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/** A saved custom food or favorite (reusable definition, per-serving macros). */
export const customFoodUpsertSchema = z.object({
  name: z.string().min(1).max(120),
  servingSize: z.string().max(80).default('1 serving'),
  calories: z.number().min(0).max(20_000),
  protein: z.number().min(0).max(2000).default(0),
  carbs: z.number().min(0).max(2000).default(0),
  fat: z.number().min(0).max(2000).default(0),
  fiber: z.number().min(0).max(500).default(0),
  sugar: z.number().min(0).max(2000).default(0),
  sodium: z.number().min(0).max(100_000).default(0),
  isFavorite: z.boolean().default(false),
});

export const foodLogIdParamsSchema = z.object({ id: z.string().min(1).max(200) });

export type FoodLogUpsertInput = z.infer<typeof foodLogUpsertSchema>;
export type CustomFoodUpsertInput = z.infer<typeof customFoodUpsertSchema>;

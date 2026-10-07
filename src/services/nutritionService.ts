import { admin } from '../config/firebase.js';
import { FOODS, type FoodItem } from '../data/foodSeed.js';
import { nutritionRepository } from '../repositories/nutritionRepository.js';
import { NotFoundError } from '../utils/errors.js';
import { groupByMeal, type FoodLogEntry } from '../utils/nutritionCalc.js';
import type { CustomFoodUpsertInput, FoodLogUpsertInput } from '../validators/nutritionValidators.js';

/**
 * Nutrition service: food search (reference + user custom foods), food logging,
 * and daily totals aggregation. Reference foods are served from the bundled
 * seed for fast, offline-friendly search; custom foods come from Firestore.
 */
export class NutritionService {
  /** Searches reference + custom foods by keyword. */
  async searchFoods(uid: string, q: string, limit = 25): Promise<FoodItem[]> {
    const needle = q.trim().toLowerCase();

    const refMatches = FOODS.filter((food) => {
      const hay = [food.name, ...food.keywords].join(' ').toLowerCase();
      return hay.includes(needle);
    });

    // Include the user's custom foods, mapped to the same shape.
    const custom = await nutritionRepository.listCustomFoods(uid);
    const customMatches: FoodItem[] = custom
      .map((c) => ({
        id: c.id as string,
        name: (c.name as string) ?? '',
        servingSize: (c.servingSize as string) ?? '1 serving',
        servingGrams: 0,
        calories: (c.calories as number) ?? 0,
        protein: (c.protein as number) ?? 0,
        carbs: (c.carbs as number) ?? 0,
        fat: (c.fat as number) ?? 0,
        fiber: (c.fiber as number) ?? 0,
        sugar: (c.sugar as number) ?? 0,
        sodium: (c.sodium as number) ?? 0,
        keywords: ['custom'],
      }))
      .filter((food) => food.name.toLowerCase().includes(needle));

    return [...customMatches, ...refMatches].slice(0, limit);
  }

  /** Returns the day's entries grouped by meal, with per-meal and total macros. */
  async getDay(uid: string, dateKey: string) {
    const rows = await nutritionRepository.listByDate(uid, dateKey);
    const entries: FoodLogEntry[] = rows.map((r) => ({
      id: r.id as string,
      mealType: (r.mealType as FoodLogEntry['mealType']) ?? 'snack',
      mealId: (r.mealId as string) ?? null,
      mealName: (r.mealName as string) ?? null,
      name: (r.name as string) ?? '',
      quantity: (r.quantity as number) ?? 1,
      calories: (r.calories as number) ?? 0,
      protein: (r.protein as number) ?? 0,
      carbs: (r.carbs as number) ?? 0,
      fat: (r.fat as number) ?? 0,
      fiber: (r.fiber as number) ?? 0,
      sugar: (r.sugar as number) ?? 0,
      sodium: (r.sodium as number) ?? 0,
    }));
    const grouped = groupByMeal(entries);
    return { dateKey, entries, ...grouped };
  }

  async addFood(uid: string, input: FoodLogUpsertInput): Promise<Record<string, unknown>> {
    // clientId (when supplied) is the idempotency key -> doc id; it must not be
    // persisted in the document body.
    const { clientId, ...data } = input;
    const id = clientId ?? nutritionRepository.newLogId(uid);
    return nutritionRepository.setLog(uid, id, {
      ...data,
      foodId: data.foodId ?? null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async updateFood(uid: string, id: string, input: FoodLogUpsertInput): Promise<Record<string, unknown>> {
    const existing = await nutritionRepository.getLog(uid, id);
    if (!existing) throw new NotFoundError('Food log entry not found');
    const { clientId, ...data } = input;
    void clientId; // clientId is an idempotency hint for addFood; not stored on update.
    return nutritionRepository.setLog(uid, id, { ...data, foodId: data.foodId ?? null });
  }

  async deleteFood(uid: string, id: string): Promise<void> {
    const existing = await nutritionRepository.getLog(uid, id);
    if (!existing) throw new NotFoundError('Food log entry not found');
    await nutritionRepository.deleteLog(uid, id);
  }

  // --- Custom foods / favorites ---

  async saveCustomFood(uid: string, input: CustomFoodUpsertInput): Promise<Record<string, unknown>> {
    const id = nutritionRepository.newCustomFoodId(uid);
    return nutritionRepository.setCustomFood(uid, id, {
      ...input,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async listCustomFoods(uid: string): Promise<Record<string, unknown>[]> {
    return nutritionRepository.listCustomFoods(uid);
  }

  async deleteCustomFood(uid: string, id: string): Promise<void> {
    await nutritionRepository.deleteCustomFood(uid, id);
  }
}

export const nutritionService = new NutritionService();

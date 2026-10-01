import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { nutritionService } from '../services/nutritionService.js';
import { ok } from '../utils/http.js';
import type { CustomFoodUpsertInput, FoodLogUpsertInput } from '../validators/nutritionValidators.js';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
    .getDate()
    .toString()
    .padStart(2, '0')}`;
}

export async function getToday(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { date } = req.query as { date?: string };
  const day = await nutritionService.getDay(uid, date ?? todayKey());
  ok(res, day);
}

export async function searchFoods(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { q, limit } = req.query as unknown as { q: string; limit?: number };
  const foods = await nutritionService.searchFoods(uid, q, limit);
  ok(res, { foods });
}

export async function addFood(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const entry = await nutritionService.addFood(uid, req.body as FoodLogUpsertInput);
  ok(res, { entry }, 201);
}

export async function updateFood(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const entry = await nutritionService.updateFood(uid, req.params.id, req.body as FoodLogUpsertInput);
  ok(res, { entry });
}

export async function deleteFood(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  await nutritionService.deleteFood(uid, req.params.id);
  ok(res, { deleted: true });
}

export async function listCustomFoods(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const foods = await nutritionService.listCustomFoods(uid);
  ok(res, { foods });
}

export async function saveCustomFood(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const food = await nutritionService.saveCustomFood(uid, req.body as CustomFoodUpsertInput);
  ok(res, { food }, 201);
}

export async function deleteCustomFood(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  await nutritionService.deleteCustomFood(uid, req.params.id);
  ok(res, { deleted: true });
}

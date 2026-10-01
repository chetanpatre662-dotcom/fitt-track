import type { Request, Response } from 'express';
import { exerciseService, type ExerciseFilters } from '../services/exerciseService.js';
import { ok } from '../utils/http.js';

export async function listExercises(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as ExerciseFilters;
  const { items, total } = await exerciseService.list(q);
  ok(res, { exercises: items, total });
}

export async function searchExercises(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as { q: string; limit?: number };
  const { items, total } = await exerciseService.list({ q: query.q, limit: query.limit });
  ok(res, { exercises: items, total });
}

export async function getExercise(req: Request, res: Response): Promise<void> {
  const exercise = await exerciseService.getById(req.params.id);
  ok(res, { exercise });
}

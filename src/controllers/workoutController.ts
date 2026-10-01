import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { workoutService } from '../services/workoutService.js';
import { ok } from '../utils/http.js';
import type { WorkoutStatusInput, WorkoutUpsertInput } from '../validators/workoutValidators.js';

export async function listWorkouts(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const q = req.query as { status?: string; isTemplate?: boolean; limit?: number };
  const workouts = await workoutService.list(uid, q);
  ok(res, { workouts });
}

export async function createWorkout(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const workout = await workoutService.create(uid, req.body as WorkoutUpsertInput);
  ok(res, { workout }, 201);
}

export async function getWorkout(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const workout = await workoutService.get(uid, req.params.id);
  ok(res, { workout });
}

export async function updateWorkout(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const workout = await workoutService.update(uid, req.params.id, req.body as WorkoutUpsertInput);
  ok(res, { workout });
}

export async function setWorkoutStatus(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { status } = req.body as WorkoutStatusInput;
  const workout = await workoutService.transition(uid, req.params.id, status);
  ok(res, { workout });
}

export async function deleteWorkout(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  await workoutService.delete(uid, req.params.id);
  ok(res, { deleted: true });
}

export async function duplicateWorkout(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const asTemplate = (req.body as { asTemplate?: boolean } | undefined)?.asTemplate;
  const workout = await workoutService.duplicate(uid, req.params.id, asTemplate);
  ok(res, { workout }, 201);
}

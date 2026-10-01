import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { routineService } from '../services/routineService.js';
import { ok } from '../utils/http.js';
import type { RoutineCompleteInput, RoutineUpsertInput } from '../validators/routineValidators.js';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
    .getDate()
    .toString()
    .padStart(2, '0')}`;
}

export async function listRoutines(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const routines = await routineService.list(uid);
  ok(res, { routines });
}

export async function getToday(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { date } = req.query as { date?: string };
  const day = await routineService.getDay(uid, date ?? todayKey());
  ok(res, day);
}

export async function createRoutine(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const routine = await routineService.create(uid, req.body as RoutineUpsertInput);
  ok(res, { routine }, 201);
}

export async function updateRoutine(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const routine = await routineService.update(uid, req.params.id, req.body as RoutineUpsertInput);
  ok(res, { routine });
}

export async function deleteRoutine(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  await routineService.delete(uid, req.params.id);
  ok(res, { deleted: true });
}

export async function completeRoutine(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { dateKey, status } = req.body as RoutineCompleteInput;
  const completion = await routineService.setCompletion(uid, req.params.id, dateKey, status);
  ok(res, { completion });
}

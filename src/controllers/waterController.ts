import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { waterService } from '../services/waterService.js';
import { ok } from '../utils/http.js';
import type { WaterAddInput } from '../validators/waterValidators.js';

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
  const day = await waterService.getDay(uid, date ?? todayKey());
  ok(res, day);
}

export async function addWater(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const entry = await waterService.add(uid, req.body as WaterAddInput);
  ok(res, { entry }, 201);
}

export async function deleteWater(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  await waterService.delete(uid, req.params.id);
  ok(res, { deleted: true });
}

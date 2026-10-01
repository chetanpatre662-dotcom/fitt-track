import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { progressService, type RangeKey } from '../services/progressService.js';
import { personalRecordService } from '../services/personalRecordService.js';
import { ok } from '../utils/http.js';

export async function getWorkoutProgress(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { range } = req.query as unknown as { range: RangeKey };
  const summary = await progressService.workoutSummary(uid, range);
  ok(res, { progress: summary });
}

export async function getWorkoutHistory(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { range, limit } = req.query as unknown as { range: RangeKey; limit?: number };
  const history = await progressService.history(uid, range, limit);
  ok(res, { history });
}

export async function getExerciseProgression(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { exerciseId, range } = req.query as unknown as { exerciseId: string; range: RangeKey };
  const progression = await progressService.exerciseProgression(uid, exerciseId, range);
  ok(res, { progression });
}

export async function getPersonalRecords(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const records = await personalRecordService.listAll(uid);
  ok(res, { personalRecords: records });
}

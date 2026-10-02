import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { progressService, type RangeKey } from '../services/progressService.js';
import { personalRecordService } from '../services/personalRecordService.js';
import { measurementService } from '../services/measurementService.js';
import { progressPhotoService } from '../services/progressPhotoService.js';
import { ok } from '../utils/http.js';
import type { MeasurementCreateInput } from '../validators/measurementValidators.js';
import type { ProgressPhotoCreateInput } from '../validators/progressPhotoValidators.js';

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

export async function getMeasurements(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const measurements = await measurementService.list(uid);
  ok(res, { measurements });
}

export async function addMeasurement(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const measurement = await measurementService.add(uid, req.body as MeasurementCreateInput);
  ok(res, { measurement }, 201);
}

export async function getProgressPhotos(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const photos = await progressPhotoService.list(uid);
  ok(res, { photos });
}

export async function addProgressPhoto(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const photo = await progressPhotoService.create(uid, req.body as ProgressPhotoCreateInput);
  ok(res, { photo }, 201);
}

export async function deleteProgressPhoto(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  await progressPhotoService.delete(uid, req.params.id);
  ok(res, { deleted: true });
}

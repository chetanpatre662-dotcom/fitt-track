import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { studentService } from '../services/studentService.js';
import { ok } from '../utils/http.js';
import type { SharingPatchInput } from '../validators/trainerValidators.js';

/** GET /api/student/trainer — the student's "My Trainer" card ({trainer:null} when unlinked). */
export async function getTrainer(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const result = await studentService.getTrainer(uid);
  ok(res, result);
}

/** PATCH /api/student/trainer/sharing — toggle progress sharing with the trainer. */
export async function setSharing(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { shareProgressWithTrainer } = req.body as SharingPatchInput;
  const result = await studentService.setSharing(uid, shareProgressWithTrainer);
  ok(res, result);
}

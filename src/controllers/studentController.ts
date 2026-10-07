import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { studentService } from '../services/studentService.js';
import { trainerService } from '../services/trainerService.js';
import { ok } from '../utils/http.js';
import type { SharingPatchInput, LinkTrainerInput } from '../validators/trainerValidators.js';

/** GET /api/student/trainer — the student's "My Trainer" card ({trainer:null} when unlinked). */
export async function getTrainer(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const result = await studentService.getTrainer(uid);
  ok(res, result);
}

/**
 * POST /api/student/connect-trainer — connect-after-registration from Profile.
 * A thin alias delegating to the same linkStudent service as /auth/link-trainer
 * (identical body/semantics incl. the switch guard) so behavior cannot drift.
 */
export async function connectTrainer(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { referralCode, confirmSwitch } = req.body as LinkTrainerInput;
  const result = await trainerService.linkStudent(uid, referralCode, { confirmSwitch });
  ok(res, result);
}

/** PATCH /api/student/trainer/sharing — toggle progress sharing with the trainer. */
export async function setSharing(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { shareProgressWithTrainer } = req.body as SharingPatchInput;
  const result = await studentService.setSharing(uid, shareProgressWithTrainer);
  ok(res, result);
}

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
 * A thin alias delegating to the same requestTrainer service as
 * /auth/link-trainer (identical body/semantics) so behavior cannot drift. A
 * valid code now creates a PENDING request (awaiting trainer approval), not an
 * active link; an unknown code stays a soft {ok:false, reason:'invalid_code'}.
 */
export async function connectTrainer(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { referralCode } = req.body as LinkTrainerInput;
  const result = await trainerService.requestTrainer(uid, referralCode);
  ok(res, result);
}

/** PATCH /api/student/trainer/sharing — toggle progress sharing with the trainer. */
export async function setSharing(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { shareProgressWithTrainer } = req.body as SharingPatchInput;
  const result = await studentService.setSharing(uid, shareProgressWithTrainer);
  ok(res, result);
}

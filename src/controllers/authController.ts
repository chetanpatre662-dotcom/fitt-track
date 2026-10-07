import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { authService } from '../services/authService.js';
import { trainerService } from '../services/trainerService.js';
import { ok } from '../utils/http.js';
import type { LinkTrainerInput, RegisterTrainerInput } from '../validators/trainerValidators.js';

/**
 * POST /api/auth/verify
 * Confirms the caller's token (already verified by middleware), ensures the
 * account doc exists, and returns account metadata used to drive routing
 * (e.g. onboardingCompleted).
 */
export async function verify(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const account = await authService.verifyAndSync({
    uid,
    email: req.auth?.email ?? null,
    emailVerified: req.auth?.email_verified ?? false,
    displayName: req.auth?.name ?? null,
  });
  ok(res, { account });
}

/**
 * POST /api/auth/link-trainer
 * Links the authenticated student to a trainer by referral code. The code is
 * validated on the backend; an unknown code is a soft success (no link) so a
 * typo never blocks registration.
 */
export async function linkTrainer(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { referralCode, confirmSwitch } = req.body as LinkTrainerInput;
  const result = await trainerService.linkStudent(uid, referralCode, { confirmSwitch });
  ok(res, result);
}

/**
 * POST /api/auth/register-trainer
 * Promotes the authenticated (just-created) Firebase user to a trainer: sets
 * the role server-side, creates the trainer record, and assigns a generated
 * unique referral code. Idempotent — a re-call never creates a duplicate
 * trainer or a second code. The role is NEVER taken from the client.
 */
export async function registerTrainer(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { name } = req.body as RegisterTrainerInput;
  const result = await trainerService.ensureTrainerAccount(uid, {
    name,
    email: req.auth?.email ?? null,
    photoUrl: req.auth?.picture ?? null,
  });
  ok(res, result);
}

/**
 * DELETE /api/auth/account
 * Permanently deletes the authenticated user's data and auth account.
 */
export async function deleteAccount(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  await authService.deleteAccount(uid);
  ok(res, { deleted: true });
}

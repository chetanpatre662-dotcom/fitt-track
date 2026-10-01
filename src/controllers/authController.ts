import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { authService } from '../services/authService.js';
import { ok } from '../utils/http.js';

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
 * DELETE /api/auth/account
 * Permanently deletes the authenticated user's data and auth account.
 */
export async function deleteAccount(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  await authService.deleteAccount(uid);
  ok(res, { deleted: true });
}

import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { profileService } from '../services/profileService.js';
import { ok } from '../utils/http.js';
import type { ProfileUpsertInput } from '../validators/profileValidators.js';

export async function getProfile(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const profile = await profileService.get(uid);
  ok(res, { profile });
}

export async function putProfile(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const profile = await profileService.upsert(uid, req.body as ProfileUpsertInput);
  ok(res, { profile });
}

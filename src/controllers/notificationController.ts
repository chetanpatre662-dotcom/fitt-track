import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { userRepository } from '../repositories/userRepository.js';
import { ok } from '../utils/http.js';
import type { FcmTokenInput } from '../validators/notificationValidators.js';

export async function registerToken(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { token } = req.body as FcmTokenInput;
  await userRepository.addFcmToken(uid, token);
  ok(res, { registered: true });
}

export async function removeToken(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { token } = req.body as FcmTokenInput;
  await userRepository.removeFcmToken(uid, token);
  ok(res, { removed: true });
}

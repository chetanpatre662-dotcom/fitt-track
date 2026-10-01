import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { gameService } from '../services/gameService.js';
import { ok } from '../utils/http.js';
import type { GameResultInput } from '../validators/gameValidators.js';

export async function recordResult(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const entry = await gameService.record(uid, req.body as GameResultInput);
  ok(res, { entry }, 201);
}

export async function getSummary(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const summary = await gameService.summary(uid);
  ok(res, summary);
}

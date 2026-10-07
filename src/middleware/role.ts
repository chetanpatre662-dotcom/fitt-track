import type { NextFunction, Request, Response } from 'express';
import { requireUid } from './auth.js';
import { roleService } from '../services/roleService.js';
import { trainerLinkRepository } from '../repositories/trainerLinkRepository.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/http.js';

/**
 * Guard that requires the authenticated caller to be a trainer. Must run AFTER
 * `authenticate`. The role is resolved server-side (never from the client);
 * non-trainers get a 403.
 */
export const requireTrainer = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const uid = requireUid(req);
    const role = await roleService.resolveRole(uid);
    if (role !== 'trainer') {
      throw new ForbiddenError('Trainer access required.');
    }
    next();
  },
);

/**
 * Asserts that `trainerId` owns an ACTIVE link to `studentUid`. Any failure —
 * missing link, a different trainer's student, or an inactive link — throws a
 * 404 (NOT 403) so a trainer cannot even distinguish "not yours" from
 * "doesn't exist", preventing cross-trainer student enumeration.
 */
export async function assertTrainerOwnsStudent(
  trainerId: string,
  studentUid: string,
): Promise<void> {
  const link = await trainerLinkRepository.get(studentUid);
  if (!link || link.trainerId !== trainerId || link.status !== 'active') {
    throw new NotFoundError('Student not found');
  }
}

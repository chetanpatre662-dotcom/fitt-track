import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { studentService } from '../services/studentService.js';
import { trainerService } from '../services/trainerService.js';
import { dietPlanAssignmentService } from '../services/dietPlanAssignmentService.js';
import { assignedWorkoutService } from '../services/assignedWorkoutService.js';
import { ok } from '../utils/http.js';
import { BadRequestError } from '../utils/errors.js';
import {
  SHARING_CATEGORIES,
  type LinkTrainerInput,
  type SharingCategory,
  type SharingPatchUnifiedInput,
} from '../validators/trainerValidators.js';

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

/**
 * PATCH /api/student/trainer/sharing — update the student's granular progress-
 * sharing preferences. Precedence (the validator already guaranteed a non-empty
 * body with no unknown keys):
 *   - granular keys only  -> apply them directly;
 *   - legacy boolean only -> map to {progressPhotos: value} (backward compat);
 *   - BOTH present        -> 400 (a client must pick one shape).
 * Returns the fully-resolved five-key sharing map.
 */
export async function setSharing(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const body = req.body as SharingPatchUnifiedInput;

  const { shareProgressWithTrainer, ...rest } = body;
  const granular: Partial<Record<SharingCategory, boolean>> = {};
  for (const category of SHARING_CATEGORIES) {
    const value = (rest as Record<string, unknown>)[category];
    if (typeof value === 'boolean') granular[category] = value;
  }
  const hasGranular = Object.keys(granular).length > 0;
  const hasLegacy = typeof shareProgressWithTrainer === 'boolean';

  if (hasGranular && hasLegacy) {
    throw new BadRequestError(
      'Send either shareProgressWithTrainer or granular sharing categories, not both.',
    );
  }

  const patch: Partial<Record<SharingCategory, boolean>> = hasLegacy
    ? { progressPhotos: shareProgressWithTrainer }
    : granular;

  const result = await studentService.setSharing(uid, patch);
  ok(res, result);
}

/**
 * GET /api/student/diet-plan — the student's current trainer-assigned diet
 * plan, or {dietPlan:null} when there is none / the plan was assigned by a
 * trainer the student is no longer actively linked to. The image (if any) is
 * returned as a short-lived backend-signed `imageUrl`, never a direct path.
 */
export async function getDietPlan(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const dietPlan = await dietPlanAssignmentService.getForStudent(uid);
  ok(res, { dietPlan });
}

/**
 * GET /api/student/assigned-workouts — the student's current trainer-assigned
 * workout schedules (empty when there is no active link, or filtered to the
 * current active trainer's items). The student's Start Workout prefills the
 * existing active-workout logger from these templates.
 */
export async function getAssignedWorkouts(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const assignedWorkouts = await assignedWorkoutService.getForStudent(uid);
  ok(res, { assignedWorkouts });
}

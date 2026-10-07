import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { assertTrainerOwnsStudent } from '../middleware/role.js';
import { trainerService } from '../services/trainerService.js';
import { ok } from '../utils/http.js';
import type {
  ReferralCodeInput,
  AvailabilityQueryInput,
} from '../validators/trainerValidators.js';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
    .getDate()
    .toString()
    .padStart(2, '0')}`;
}

export async function getProfile(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const profile = await trainerService.getProfile(trainerId);
  ok(res, { profile });
}

export async function listStudents(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const students = await trainerService.listStudents(trainerId);
  ok(res, { students });
}

export async function studentOverview(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const overview = await trainerService.studentOverview(studentUid);
  ok(res, { overview });
}

export async function studentWorkouts(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const { date } = req.query as { date?: string };
  const workouts = await trainerService.studentWorkoutsForDate(studentUid, date ?? todayKey());
  ok(res, { workouts });
}

export async function studentWorkoutHistory(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const { limit } = req.query as unknown as { limit?: number };
  const history = await trainerService.studentWorkoutHistory(studentUid, limit);
  ok(res, { history });
}

export async function studentNutrition(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const { date } = req.query as { date?: string };
  const nutrition = await trainerService.studentNutrition(studentUid, date ?? todayKey());
  ok(res, nutrition);
}

export async function studentWater(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const { date } = req.query as { date?: string };
  const water = await trainerService.studentWater(studentUid, date ?? todayKey());
  ok(res, water);
}

export async function studentProgress(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const progress = await trainerService.studentProgress(studentUid);
  ok(res, { progress });
}

export async function studentPhotos(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const result = await trainerService.studentPhotos(studentUid);
  ok(res, result);
}

/** GET /api/trainer/referral-code — the trainer's current code. */
export async function getReferralCode(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const referralCode = await trainerService.getReferralCode(trainerId);
  ok(res, { referralCode });
}

/** POST /api/trainer/referral-code — generate a new unique code (regenerate). */
export async function generateReferralCode(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const code = await trainerService.generateReferralCode(trainerId);
  ok(res, { referralCode: { code, active: true } });
}

/** PATCH /api/trainer/referral-code — set a custom code. */
export async function setReferralCode(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { code } = req.body as ReferralCodeInput;
  const saved = await trainerService.setCustomReferralCode(trainerId, code);
  ok(res, { referralCode: { code: saved, active: true } });
}

/** GET /api/trainer/referral-code/availability?code= — availability check. */
export async function checkReferralCodeAvailability(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { code } = req.query as unknown as AvailabilityQueryInput;
  const result = await trainerService.checkAvailability(code, trainerId);
  ok(res, result);
}

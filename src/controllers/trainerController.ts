import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { assertTrainerOwnsStudent } from '../middleware/role.js';
import { trainerService } from '../services/trainerService.js';
import { dietPlanAssignmentService } from '../services/dietPlanAssignmentService.js';
import { assignedWorkoutService } from '../services/assignedWorkoutService.js';
import { measurementService } from '../services/measurementService.js';
import type { RangeKey } from '../services/progressService.js';
import { ok } from '../utils/http.js';
import type {
  ReferralCodeInput,
  AvailabilityQueryInput,
  DietPlanUpsertInput,
  AssignWorkoutInput,
  BatchStudentUidsInput,
  TrainerProfileInput,
} from '../validators/trainerValidators.js';
import type { MeasurementCreateInput } from '../validators/measurementValidators.js';

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

/**
 * PATCH /api/trainer/profile — owner self-edit of the trainer profile. The body
 * is validated by trainerProfileSchema; the service merges the patch onto
 * trainers/{uid}, recomputes `profileCompleted`, and returns the fresh profile.
 */
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const patch = req.body as TrainerProfileInput;
  const profile = await trainerService.updateTrainerProfile(trainerId, patch);
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
  const result = await trainerService.studentWorkoutsForDate(studentUid, date ?? todayKey());
  ok(res, result);
}

export async function studentWorkoutHistory(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const { limit, cursor } = req.query as unknown as { limit?: number; cursor?: string };
  const result = await trainerService.studentWorkoutHistory(studentUid, { limit, cursor });
  ok(res, result);
}

/**
 * GET /api/trainer/students/:studentUid/workouts/:workoutId — the full embedded
 * detail of one stored workout (every recorded set incl. cardio fields), gated
 * by the student's workoutHistory sharing category. Ownership (404) is asserted
 * first; the service returns {shared:false, workout:null} when sharing is off
 * and {shared:true, workout:null} when the doc does not exist.
 */
export async function studentWorkoutDetail(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid, workoutId } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const result = await trainerService.studentWorkoutDetail(studentUid, workoutId);
  ok(res, result);
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
  const result = await trainerService.studentProgress(studentUid);
  ok(res, result);
}

export async function studentPhotos(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const result = await trainerService.studentPhotos(studentUid);
  ok(res, result);
}

/** GET /api/trainer/students/:studentUid/measurements — body-measurement history. */
export async function studentMeasurements(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const result = await trainerService.studentMeasurements(studentUid);
  ok(res, result);
}

/**
 * POST /api/trainer/students/:studentUid/measurements — append a dated
 * body-measurement record for the student. Ownership (404) is asserted before
 * any write; the body is validated by measurementCreateSchema and the write
 * goes through the SAME measurementService.add the student path uses, so
 * trainer- and student-written records are byte-identical. Admin-SDK-mediated
 * (no Firestore-rule change). History-preserving: never overwrites.
 */
export async function addStudentMeasurement(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const created = await measurementService.add(studentUid, req.body as MeasurementCreateInput);
  ok(res, { measurement: created });
}

/** GET /api/trainer/students/:studentUid/exercise — per-exercise progression. */
export async function studentExerciseProgression(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const { exerciseId, range } = req.query as unknown as { exerciseId: string; range: RangeKey };
  const result = await trainerService.studentExerciseProgression(studentUid, exerciseId, range);
  ok(res, result);
}

/** GET /api/trainer/students/:studentUid/records — personal records. */
export async function studentRecords(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const result = await trainerService.studentRecords(studentUid);
  ok(res, result);
}

/**
 * POST /api/trainer/students/:studentUid/diet-plan — assign/replace the
 * student's diet plan (text and/or an uploaded image). Ownership (404) is
 * asserted before any write; the service enforces the storage-path guard.
 */
export async function assignDietPlan(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const body = req.body as DietPlanUpsertInput;
  const dietPlan = await dietPlanAssignmentService.assignForStudent(trainerId, studentUid, body);
  ok(res, { dietPlan });
}

/**
 * GET /api/trainer/students/:studentUid/diet-plan — the diet plan the trainer
 * previously assigned to this student (text + short-lived signed image URL), or
 * { dietPlan: null } when none exists. Ownership (404) is asserted first.
 */
export async function studentDietPlan(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const dietPlan = await dietPlanAssignmentService.getForTrainer(trainerId, studentUid);
  ok(res, { dietPlan });
}

/**
 * POST /api/trainer/students/:studentUid/workouts/assign — schedule a workout
 * for the student from a template of exercises. Ownership (404) is asserted
 * before any write; the body shape/limits are validated by assignWorkoutSchema.
 */
export async function assignWorkout(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const body = req.body as AssignWorkoutInput;
  const assignedWorkout = await assignedWorkoutService.assignForStudent(trainerId, studentUid, body);
  ok(res, { assignedWorkout });
}

/**
 * DELETE /api/trainer/students/:studentUid — remove a student from the trainer
 * (§5). Ownership (404) is asserted first; the service flips the link to the
 * existing 'inactive' status and clears the profile mirror WITHOUT deleting the
 * student's account or any of their personal data.
 */
export async function removeStudent(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  await assertTrainerOwnsStudent(trainerId, studentUid);
  const result = await trainerService.removeStudent(trainerId, studentUid);
  ok(res, result);
}

/** GET /api/trainer/requests — pending connect requests (name + photo). */
export async function listRequests(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const requests = await trainerService.listRequestsForTrainer(trainerId);
  ok(res, { requests });
}

/** POST /api/trainer/requests/:studentUid/approve — approve a pending request. */
export async function approveRequest(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  const result = await trainerService.approveRequest(trainerId, studentUid);
  ok(res, { ok: true, studentUid, status: result.status });
}

/** POST /api/trainer/requests/:studentUid/reject — reject a pending request. */
export async function rejectRequest(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUid } = req.params;
  const result = await trainerService.rejectRequest(trainerId, studentUid);
  ok(res, { ok: true, studentUid, status: result.status });
}

/**
 * POST /api/trainer/requests/batch/approve — approve several pending requests
 * (§6). Each unique id is revalidated server-side; per-item failures are
 * reported without failing the batch.
 */
export async function batchApproveRequests(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUids } = req.body as BatchStudentUidsInput;
  const result = await trainerService.batchApproveRequests(trainerId, studentUids);
  ok(res, result);
}

/** POST /api/trainer/requests/batch/reject — reject several pending requests (§6). */
export async function batchRejectRequests(req: Request, res: Response): Promise<void> {
  const trainerId = requireUid(req);
  const { studentUids } = req.body as BatchStudentUidsInput;
  const result = await trainerService.batchRejectRequests(trainerId, studentUids);
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

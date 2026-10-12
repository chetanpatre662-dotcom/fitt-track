import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTrainer } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import {
  dateQuerySchema,
  historyQuerySchema,
  studentUidParamsSchema,
  referralCodeSchema,
  availabilityQuerySchema,
  dietPlanUpsertSchema,
  assignWorkoutSchema,
  workoutDetailParamsSchema,
  batchStudentUidsSchema,
} from '../validators/trainerValidators.js';
import { measurementCreateSchema } from '../validators/measurementValidators.js';
import { exerciseProgressionQuerySchema } from '../validators/progressValidators.js';
import * as c from '../controllers/trainerController.js';

const router = Router();

// Every trainer route requires a valid token AND a server-resolved trainer role.
router.use(authenticate);
router.use(requireTrainer);

router.get('/profile', asyncHandler(c.getProfile));
router.get('/students', asyncHandler(c.listStudents));

// Referral-code management (self-service, trainer-only).
router.get(
  '/referral-code/availability',
  validate({ query: availabilityQuerySchema }),
  asyncHandler(c.checkReferralCodeAvailability),
);
router.get('/referral-code', asyncHandler(c.getReferralCode));
router.post('/referral-code', asyncHandler(c.generateReferralCode));
router.patch(
  '/referral-code',
  validate({ body: referralCodeSchema }),
  asyncHandler(c.setReferralCode),
);

const studentParams = { params: studentUidParamsSchema };

// Connect-request inbox (trainer-only): list pending, approve/reject.
router.get('/requests', asyncHandler(c.listRequests));
// Batch approve/reject. REGISTERED BEFORE the /requests/:studentUid param
// routes on purpose: Express matches in registration order, so the literal
// `batch/` segment must come first or the :studentUid param route would capture
// it. See design §6 route-collision constraint.
router.post(
  '/requests/batch/approve',
  validate({ body: batchStudentUidsSchema }),
  asyncHandler(c.batchApproveRequests),
);
router.post(
  '/requests/batch/reject',
  validate({ body: batchStudentUidsSchema }),
  asyncHandler(c.batchRejectRequests),
);
router.post(
  '/requests/:studentUid/approve',
  validate(studentParams),
  asyncHandler(c.approveRequest),
);
router.post(
  '/requests/:studentUid/reject',
  validate(studentParams),
  asyncHandler(c.rejectRequest),
);

router.get('/students/:studentUid/overview', validate(studentParams), asyncHandler(c.studentOverview));

// Remove a student from the trainer (§5): non-destructive status flip, never a
// data/account deletion.
router.delete('/students/:studentUid', validate(studentParams), asyncHandler(c.removeStudent));
router.get(
  '/students/:studentUid/workouts',
  validate({ ...studentParams, query: dateQuerySchema }),
  asyncHandler(c.studentWorkouts),
);
router.get(
  '/students/:studentUid/workouts/history',
  validate({ ...studentParams, query: historyQuerySchema }),
  asyncHandler(c.studentWorkoutHistory),
);
router.get(
  '/students/:studentUid/nutrition',
  validate({ ...studentParams, query: dateQuerySchema }),
  asyncHandler(c.studentNutrition),
);
router.get(
  '/students/:studentUid/water',
  validate({ ...studentParams, query: dateQuerySchema }),
  asyncHandler(c.studentWater),
);
router.get('/students/:studentUid/progress', validate(studentParams), asyncHandler(c.studentProgress));
router.get('/students/:studentUid/photos', validate(studentParams), asyncHandler(c.studentPhotos));
router.get(
  '/students/:studentUid/measurements',
  validate(studentParams),
  asyncHandler(c.studentMeasurements),
);
// Append a dated body-measurement record for the student (reuses the SAME
// validator + service as the student path; Admin-SDK-mediated, no rule change).
router.post(
  '/students/:studentUid/measurements',
  validate({ ...studentParams, body: measurementCreateSchema }),
  asyncHandler(c.addStudentMeasurement),
);
router.get(
  '/students/:studentUid/exercise',
  validate({ ...studentParams, query: exerciseProgressionQuerySchema }),
  asyncHandler(c.studentExerciseProgression),
);
router.get(
  '/students/:studentUid/records',
  validate(studentParams),
  asyncHandler(c.studentRecords),
);
router.get(
  '/students/:studentUid/diet-plan',
  validate(studentParams),
  asyncHandler(c.studentDietPlan),
);

// Assign/replace a student's diet plan (text and/or uploaded image).
router.post(
  '/students/:studentUid/diet-plan',
  validate({ ...studentParams, body: dietPlanUpsertSchema }),
  asyncHandler(c.assignDietPlan),
);

// Schedule a workout for a student from a template of exercises.
router.post(
  '/students/:studentUid/workouts/assign',
  validate({ ...studentParams, body: assignWorkoutSchema }),
  asyncHandler(c.assignWorkout),
);

// Single-workout detail. REGISTERED LAST on purpose: Express matches routes in
// registration order, so the :workoutId param route MUST come after the literal
// /workouts/history and /workouts/assign segments above or it would capture
// them. See design §3 route-ordering constraint.
router.get(
  '/students/:studentUid/workouts/:workoutId',
  validate({ params: workoutDetailParamsSchema }),
  asyncHandler(c.studentWorkoutDetail),
);

export default router;

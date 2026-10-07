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
} from '../validators/trainerValidators.js';
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

export default router;

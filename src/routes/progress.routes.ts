import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { exerciseProgressionQuerySchema, rangeQuerySchema } from '../validators/progressValidators.js';
import * as c from '../controllers/progressController.js';

const router = Router();
router.use(authenticate);

router.get('/', validate({ query: rangeQuerySchema }), asyncHandler(c.getWorkoutProgress));
router.get('/workouts', validate({ query: rangeQuerySchema }), asyncHandler(c.getWorkoutProgress));
router.get('/history', validate({ query: rangeQuerySchema }), asyncHandler(c.getWorkoutHistory));
router.get(
  '/exercise',
  validate({ query: exerciseProgressionQuerySchema }),
  asyncHandler(c.getExerciseProgression),
);
router.get('/records', asyncHandler(c.getPersonalRecords));

export default router;

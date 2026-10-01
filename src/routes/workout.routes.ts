import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import {
  workoutIdParamsSchema,
  workoutListQuerySchema,
  workoutStatusSchema,
  workoutUpsertSchema,
} from '../validators/workoutValidators.js';
import * as c from '../controllers/workoutController.js';

const router = Router();
router.use(authenticate);

router.get('/', validate({ query: workoutListQuerySchema }), asyncHandler(c.listWorkouts));
router.post('/', validate({ body: workoutUpsertSchema }), asyncHandler(c.createWorkout));
router.get('/:id', validate({ params: workoutIdParamsSchema }), asyncHandler(c.getWorkout));
router.put(
  '/:id',
  validate({ params: workoutIdParamsSchema, body: workoutUpsertSchema }),
  asyncHandler(c.updateWorkout),
);
router.patch(
  '/:id/status',
  validate({ params: workoutIdParamsSchema, body: workoutStatusSchema }),
  asyncHandler(c.setWorkoutStatus),
);
router.post('/:id/duplicate', validate({ params: workoutIdParamsSchema }), asyncHandler(c.duplicateWorkout));
router.delete('/:id', validate({ params: workoutIdParamsSchema }), asyncHandler(c.deleteWorkout));

export default router;

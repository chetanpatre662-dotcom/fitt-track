import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import {
  exerciseIdParamsSchema,
  exerciseListQuerySchema,
  exerciseSearchQuerySchema,
} from '../validators/exerciseValidators.js';
import * as exerciseController from '../controllers/exerciseController.js';

const router = Router();

// The exercise library is per-user readable; require authentication.
router.use(authenticate);

router.get('/search', validate({ query: exerciseSearchQuerySchema }), asyncHandler(exerciseController.searchExercises));
router.get('/', validate({ query: exerciseListQuerySchema }), asyncHandler(exerciseController.listExercises));
router.get('/:id', validate({ params: exerciseIdParamsSchema }), asyncHandler(exerciseController.getExercise));

export default router;

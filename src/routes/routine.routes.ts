import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import {
  routineCompleteSchema,
  routineCompletionsQuerySchema,
  routineIdParamsSchema,
  routineUpsertSchema,
} from '../validators/routineValidators.js';
import * as c from '../controllers/routineController.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(c.listRoutines));
router.get('/today', validate({ query: routineCompletionsQuerySchema }), asyncHandler(c.getToday));
router.post('/', validate({ body: routineUpsertSchema }), asyncHandler(c.createRoutine));
router.put('/:id', validate({ params: routineIdParamsSchema, body: routineUpsertSchema }), asyncHandler(c.updateRoutine));
router.delete('/:id', validate({ params: routineIdParamsSchema }), asyncHandler(c.deleteRoutine));
router.post('/:id/complete', validate({ params: routineIdParamsSchema, body: routineCompleteSchema }), asyncHandler(c.completeRoutine));

export default router;

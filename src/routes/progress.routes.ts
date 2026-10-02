import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { exerciseProgressionQuerySchema, rangeQuerySchema } from '../validators/progressValidators.js';
import { measurementCreateSchema } from '../validators/measurementValidators.js';
import {
  progressPhotoCreateSchema,
  progressPhotoIdParamsSchema,
} from '../validators/progressPhotoValidators.js';
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

// Body-measurement history (height/weight over time).
router.get('/measurements', asyncHandler(c.getMeasurements));
router.post('/measurements', validate({ body: measurementCreateSchema }), asyncHandler(c.addMeasurement));

// Private progress photos (metadata; image bytes live in Firebase Storage).
router.get('/photos', asyncHandler(c.getProgressPhotos));
router.post('/photos', validate({ body: progressPhotoCreateSchema }), asyncHandler(c.addProgressPhoto));
router.delete('/photos/:id', validate({ params: progressPhotoIdParamsSchema }), asyncHandler(c.deleteProgressPhoto));

export default router;

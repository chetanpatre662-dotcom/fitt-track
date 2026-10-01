import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/http.js';
import {
  chatSchema,
  generateWorkoutSchema,
  substitutionRequestSchema,
  workoutRecoSchema,
} from '../validators/aiValidators.js';
import * as c from '../controllers/aiController.js';

const router = Router();

// AI routes require auth and use a stricter rate limit (Gemini calls cost).
router.use(authenticate);
router.use(aiLimiter);

router.post('/daily-insight', asyncHandler(c.dailyInsight));
router.post('/workout-recommendation', validate({ body: workoutRecoSchema }), asyncHandler(c.workoutRecommendation));
router.post('/generate-workout', validate({ body: generateWorkoutSchema }), asyncHandler(c.generateWorkout));
router.post('/nutrition-recommendation', asyncHandler(c.nutritionRecommendation));
router.post('/exercise-substitution', validate({ body: substitutionRequestSchema }), asyncHandler(c.exerciseSubstitution));
router.post('/recovery', asyncHandler(c.recovery));
router.post('/progress-analysis', asyncHandler(c.progressAnalysis));
router.post('/chat', validate({ body: chatSchema }), asyncHandler(c.chat));

export default router;

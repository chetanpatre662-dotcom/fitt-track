import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import * as authController from '../controllers/authController.js';
import { linkTrainerSchema, registerTrainerSchema } from '../validators/trainerValidators.js';

const router = Router();

// All auth routes require a valid Firebase ID token.
router.use(authenticate);

router.post('/verify', asyncHandler(authController.verify));
router.post(
  '/link-trainer',
  validate({ body: linkTrainerSchema }),
  asyncHandler(authController.linkTrainer),
);
router.post(
  '/register-trainer',
  validate({ body: registerTrainerSchema }),
  asyncHandler(authController.registerTrainer),
);
router.delete('/account', asyncHandler(authController.deleteAccount));

export default router;

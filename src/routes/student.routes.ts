import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { sharingPatchSchema, linkTrainerSchema } from '../validators/trainerValidators.js';
import * as c from '../controllers/studentController.js';

const router = Router();

// Student relationship routes require a valid token; any authenticated user may
// read their own trainer card and toggle their own sharing preference.
router.use(authenticate);

router.get('/trainer', asyncHandler(c.getTrainer));
router.post(
  '/connect-trainer',
  validate({ body: linkTrainerSchema }),
  asyncHandler(c.connectTrainer),
);
router.patch(
  '/trainer/sharing',
  validate({ body: sharingPatchSchema }),
  asyncHandler(c.setSharing),
);

export default router;

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { profileUpsertSchema } from '../validators/profileValidators.js';
import * as profileController from '../controllers/profileController.js';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(profileController.getProfile));
router.put('/', validate({ body: profileUpsertSchema }), asyncHandler(profileController.putProfile));

export default router;

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { fcmTokenSchema } from '../validators/notificationValidators.js';
import * as c from '../controllers/notificationController.js';

const router = Router();
router.use(authenticate);

router.post('/register-token', validate({ body: fcmTokenSchema }), asyncHandler(c.registerToken));
router.delete('/token', validate({ body: fcmTokenSchema }), asyncHandler(c.removeToken));

export default router;

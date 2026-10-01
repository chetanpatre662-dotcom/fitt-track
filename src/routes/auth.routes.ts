import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import * as authController from '../controllers/authController.js';

const router = Router();

// All auth routes require a valid Firebase ID token.
router.use(authenticate);

router.post('/verify', asyncHandler(authController.verify));
router.delete('/account', asyncHandler(authController.deleteAccount));

export default router;

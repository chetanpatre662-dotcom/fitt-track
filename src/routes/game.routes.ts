import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { gameResultSchema } from '../validators/gameValidators.js';
import * as c from '../controllers/gameController.js';

const router = Router();
router.use(authenticate);

router.get('/summary', asyncHandler(c.getSummary));
router.post('/result', validate({ body: gameResultSchema }), asyncHandler(c.recordResult));

export default router;

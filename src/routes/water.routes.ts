import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import { waterAddSchema, waterDayQuerySchema, waterIdParamsSchema } from '../validators/waterValidators.js';
import * as c from '../controllers/waterController.js';

const router = Router();
router.use(authenticate);

router.get('/today', validate({ query: waterDayQuerySchema }), asyncHandler(c.getToday));
router.post('/', validate({ body: waterAddSchema }), asyncHandler(c.addWater));
router.delete('/:id', validate({ params: waterIdParamsSchema }), asyncHandler(c.deleteWater));

export default router;

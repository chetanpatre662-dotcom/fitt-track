import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/http.js';
import {
  customFoodUpsertSchema,
  foodLogIdParamsSchema,
  foodLogUpsertSchema,
  foodSearchQuerySchema,
  nutritionDayQuerySchema,
} from '../validators/nutritionValidators.js';
import * as c from '../controllers/nutritionController.js';

const router = Router();
router.use(authenticate);

router.get('/today', validate({ query: nutritionDayQuerySchema }), asyncHandler(c.getToday));
router.get('/foods/search', validate({ query: foodSearchQuerySchema }), asyncHandler(c.searchFoods));

router.get('/custom-foods', asyncHandler(c.listCustomFoods));
router.post('/custom-foods', validate({ body: customFoodUpsertSchema }), asyncHandler(c.saveCustomFood));
router.delete('/custom-foods/:id', validate({ params: foodLogIdParamsSchema }), asyncHandler(c.deleteCustomFood));

router.post('/food', validate({ body: foodLogUpsertSchema }), asyncHandler(c.addFood));
router.put('/food/:id', validate({ params: foodLogIdParamsSchema, body: foodLogUpsertSchema }), asyncHandler(c.updateFood));
router.delete('/food/:id', validate({ params: foodLogIdParamsSchema }), asyncHandler(c.deleteFood));

export default router;

import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/http/asyncHandler';
import { codeParam } from '../transaction/transaction.schema';
import { checkoutController } from './checkout.controller';

const router = Router();

// Public hosted-checkout endpoints — opened from the buyer's payment link, no auth.
router.get('/:code', validate({ params: codeParam }), asyncHandler(checkoutController.get));
router.post('/:code/pay', validate({ params: codeParam }), asyncHandler(checkoutController.pay));

export const checkoutRoutes = router;

import { Router } from 'express';
import { authGuard } from '../../common/middleware/authGuard';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/http/asyncHandler';
import {
  ledgerQuerySchema,
  walletController,
  withdrawSchema,
} from './wallet.controller';

const router = Router();
router.use(authGuard);

router.get('/balance', asyncHandler(walletController.balance));
router.get('/ledger', validate({ query: ledgerQuerySchema }), asyncHandler(walletController.ledger));
router.post('/withdraw', validate({ body: withdrawSchema }), asyncHandler(walletController.withdraw));

export const walletRoutes = router;

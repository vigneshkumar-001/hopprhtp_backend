import { Router } from 'express';
import { authGuard } from '../../common/middleware/authGuard';
import { pinGuard } from '../../common/middleware/pinGuard';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/http/asyncHandler';
import { transactionController } from './transaction.controller';
import {
  cancelSchema,
  codeParam,
  confirmDeliverySchema,
  createTransactionSchema,
  idParam,
  listQuerySchema,
  shipSchema,
} from './transaction.schema';

const router = Router();
router.use(authGuard);

// Creating a transaction requires the user's PIN (verified, never stored).
router.post('/', pinGuard, validate({ body: createTransactionSchema }), asyncHandler(transactionController.create));
router.get('/', validate({ query: listQuerySchema }), asyncHandler(transactionController.list));

// Lookup by public code (Enter Transaction Code screen) — must precede /:id.
router.get('/code/:code', validate({ params: codeParam }), asyncHandler(transactionController.getByCode));
router.get('/:id', validate({ params: idParam }), asyncHandler(transactionController.getOne));

// Lifecycle actions.
const id = { params: idParam };
router.post('/:id/agree', validate(id), asyncHandler(transactionController.agree));
router.post('/:id/fund', validate(id), asyncHandler(transactionController.fund));
router.post('/:id/ship', validate({ ...id, body: shipSchema }), asyncHandler(transactionController.ship));
router.post('/:id/out-for-delivery', validate(id), asyncHandler(transactionController.outForDelivery));
router.post(
  '/:id/confirm-delivery',
  validate({ ...id, body: confirmDeliverySchema }),
  asyncHandler(transactionController.confirmDelivery),
);
router.post('/:id/release', validate(id), asyncHandler(transactionController.release));
router.post('/:id/cancel', validate({ ...id, body: cancelSchema }), asyncHandler(transactionController.cancel));

export const transactionRoutes = router;

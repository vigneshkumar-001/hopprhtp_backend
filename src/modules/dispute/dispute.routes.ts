import { Router } from 'express';
import { authGuard, requireRole } from '../../common/middleware/authGuard';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/http/asyncHandler';
import { disputeController } from './dispute.controller';
import { idParam, raiseDisputeSchema, resolveDisputeSchema } from './dispute.schema';

const router = Router();
router.use(authGuard);

router.post('/', validate({ body: raiseDisputeSchema }), asyncHandler(disputeController.raise));
router.get('/:id', validate({ params: idParam }), asyncHandler(disputeController.getOne));

// Resolution is admin-only (the AI Evidence Review → admin decision screen).
router.post(
  '/:id/resolve',
  requireRole('admin'),
  validate({ params: idParam, body: resolveDisputeSchema }),
  asyncHandler(disputeController.resolve),
);

export const disputeRoutes = router;

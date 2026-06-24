import { Router } from 'express';
import { authGuard } from '../../common/middleware/authGuard';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/http/asyncHandler';
import { userController } from './user.controller';
import {
  addPayoutAccountSchema,
  identityVerifySchema,
  objectIdParam,
  updateProfileSchema,
} from './user.schema';

const router = Router();
router.use(authGuard);

router.get('/me', asyncHandler(userController.me));
router.patch('/me', validate({ body: updateProfileSchema }), asyncHandler(userController.updateProfile));

router.post(
  '/me/payout-accounts',
  validate({ body: addPayoutAccountSchema }),
  asyncHandler(userController.addPayoutAccount),
);
router.patch(
  '/me/payout-accounts/:id/default',
  validate({ params: objectIdParam }),
  asyncHandler(userController.setDefaultPayoutAccount),
);

router.post(
  '/me/identity',
  validate({ body: identityVerifySchema }),
  asyncHandler(userController.submitIdentity),
);

export const userRoutes = router;

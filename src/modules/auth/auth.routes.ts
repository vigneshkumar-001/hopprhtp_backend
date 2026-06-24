import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/http/asyncHandler';
import { authGuard } from '../../common/middleware/authGuard';
import { authLimiter } from '../../common/middleware/rateLimiter';
import {
  confirmRegisterSchema,
  loginSchema,
  refreshSchema,
  requestOtpSchema,
} from './auth.schema';

const router = Router();

// Brute-force-sensitive endpoints get the tight limiter.
router.post('/register/request-otp', authLimiter, validate({ body: requestOtpSchema }), asyncHandler(authController.requestOtp));
router.post('/register/confirm', authLimiter, validate({ body: confirmRegisterSchema }), asyncHandler(authController.confirmRegister));
router.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(authController.login));
router.post('/refresh', validate({ body: refreshSchema }), asyncHandler(authController.refresh));
router.post('/logout-all', authGuard, asyncHandler(authController.logoutAll));

export const authRoutes = router;

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
  changePinSchema,
  requestOtpSchema,
  resendOtpSchema,
  verifyOtpSchema,
  verifyPinSchema,
  pinResetRequestSchema,
  pinResetConfirmSchema,
} from './auth.schema';

const router = Router();

// Brute-force-sensitive endpoints get the tight limiter.
router.post('/register/request-otp', authLimiter, validate({ body: requestOtpSchema }), asyncHandler(authController.requestOtp));
router.post('/register/confirm', authLimiter, validate({ body: confirmRegisterSchema }), asyncHandler(authController.confirmRegister));
router.post('/resend-otp', authLimiter, validate({ body: resendOtpSchema }), asyncHandler(authController.resendOtp));
router.post('/verify-otp', authLimiter, validate({ body: verifyOtpSchema }), asyncHandler(authController.verifyOtp));
router.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(authController.login));
router.post('/refresh', validate({ body: refreshSchema }), asyncHandler(authController.refresh));
router.post('/pin-reset/request-otp', authLimiter, validate({ body: pinResetRequestSchema }), asyncHandler(authController.requestPinReset));
router.post('/pin-reset/confirm', authLimiter, validate({ body: pinResetConfirmSchema }), asyncHandler(authController.confirmPinReset));
router.post('/logout-all', authGuard, asyncHandler(authController.logoutAll));
router.post('/change-pin', authGuard, validate({ body: changePinSchema }), asyncHandler(authController.changePin));
router.post('/verify-pin', authGuard, validate({ body: verifyPinSchema }), asyncHandler(authController.verifyPin));

export const authRoutes = router;

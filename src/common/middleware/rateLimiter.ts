import rateLimit from 'express-rate-limit';
import { isTest } from '../../config/env';

const skip = () => isTest; // never throttle the test suite

/** Generous default limit for general API traffic. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

/** Tight limit on auth endpoints to blunt credential / PIN brute-forcing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

import type { NextFunction, Request, Response } from 'express';
import { authService } from '../../modules/auth/auth.service';
import { BadRequest, Unauthorized } from '../errors';

/**
 * Requires a valid 6-digit PIN in `req.body.pin` for sensitive actions (e.g.
 * creating a transaction or releasing funds).
 *
 * MUST run BEFORE `validate` — the Zod schemas strip unknown keys, so the PIN
 * would otherwise be removed before we can read it. The PIN is verified against
 * the stored Argon2id hash and is never persisted.
 */
export async function pinGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw Unauthorized();
    const pin = String((req.body as { pin?: unknown } | undefined)?.pin ?? '');
    if (!/^\d{6}$/.test(pin)) {
      throw BadRequest('Enter your 6-digit PIN to continue');
    }
    await authService.verifyPin(req.auth.sub, pin);
    next();
  } catch (err) {
    next(err);
  }
}

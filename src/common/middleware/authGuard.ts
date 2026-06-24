import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { Forbidden, Unauthorized } from '../errors';
import type { AuthPayload, Role } from '../types';
import { UserModel } from '../../modules/user/user.model';

// Augment Express' Request so `req.auth` is typed everywhere downstream.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/**
 * Verifies the access token AND re-checks `tokenVersion` against the DB, so a
 * "log out everywhere" / PIN reset instantly invalidates every issued token.
 */
export async function authGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearer(req);
    if (!token) throw Unauthorized();

    const payload = verifyAccessToken(token);

    const user = await UserModel.findById(payload.sub)
      .select('tokenVersion role status')
      .lean();

    if (!user) throw Unauthorized('Account no longer exists');
    if (user.status === 'suspended') throw Forbidden('Account suspended');
    if ((user.tokenVersion ?? 0) !== payload.tokenVersion) {
      throw Unauthorized('Session expired, please sign in again');
    }

    req.auth = { sub: payload.sub, role: user.role as Role, tokenVersion: payload.tokenVersion };
    next();
  } catch (err) {
    next(err);
  }
}

/** Restrict a route to one or more roles (e.g. admin-only dispute resolution). */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(Unauthorized());
    if (!roles.includes(req.auth.role)) return next(Forbidden());
    next();
  };

import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import type { AuthPayload, Role } from '../types';
import { Unauthorized } from '../errors';

type TokenInput = { userId: string; role: Role; tokenVersion: number };

export function signAccessToken(input: TokenInput): string {
  const payload: AuthPayload = {
    sub: input.userId,
    role: input.role,
    tokenVersion: input.tokenVersion,
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
}

export function signRefreshToken(input: TokenInput): string {
  const payload: AuthPayload = {
    sub: input.userId,
    role: input.role,
    tokenVersion: input.tokenVersion,
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  } as SignOptions);
}

function decode(token: string, secret: string): AuthPayload {
  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    return {
      sub: String(decoded.sub),
      role: (decoded.role as Role) ?? 'user',
      tokenVersion: Number(decoded.tokenVersion ?? 0),
    };
  } catch {
    throw Unauthorized('Invalid or expired token');
  }
}

export const verifyAccessToken = (token: string): AuthPayload =>
  decode(token, env.JWT_ACCESS_SECRET);

export const verifyRefreshToken = (token: string): AuthPayload =>
  decode(token, env.JWT_REFRESH_SECRET);

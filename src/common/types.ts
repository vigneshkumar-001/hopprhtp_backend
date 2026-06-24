import type { Request } from 'express';

/** Roles a user can hold. Admin is required for dispute resolution endpoints. */
export type Role = 'user' | 'admin';

/** Decoded JWT access-token payload attached to every authenticated request. */
export interface AuthPayload {
  sub: string; // user id
  role: Role;
  tokenVersion: number;
}

/** Express request once `authGuard` has run. */
export interface AuthedRequest extends Request {
  auth: AuthPayload;
}

/** Standard success envelope used by every controller. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** Standard error envelope produced by the global error handler. */
export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export const ok = <T>(data: T): ApiSuccess<T> => ({ success: true, data });

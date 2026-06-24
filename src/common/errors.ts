/**
 * Operational error with an HTTP status + machine-readable code. Anything that
 * is NOT an AppError is treated as an unexpected bug (500) by the error handler.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly isOperational = true;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export const BadRequest = (msg = 'Bad request', details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', msg, details);

export const Unauthorized = (msg = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', msg);

export const Forbidden = (msg = 'You do not have access to this resource') =>
  new AppError(403, 'FORBIDDEN', msg);

export const NotFound = (msg = 'Resource not found') =>
  new AppError(404, 'NOT_FOUND', msg);

export const Conflict = (msg = 'Resource already exists', details?: unknown) =>
  new AppError(409, 'CONFLICT', msg, details);

export const UnprocessableEntity = (msg = 'Validation failed', details?: unknown) =>
  new AppError(422, 'VALIDATION_ERROR', msg, details);

export const TooManyRequests = (msg = 'Too many requests') =>
  new AppError(429, 'RATE_LIMITED', msg);

/** Invalid escrow lifecycle transition (e.g. trying to `ship` before funding). */
export const InvalidTransition = (msg: string, details?: unknown) =>
  new AppError(409, 'INVALID_TRANSITION', msg, details);

export const Upstream = (msg = 'Upstream service error', details?: unknown) =>
  new AppError(502, 'UPSTREAM_ERROR', msg, details);

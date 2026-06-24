import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../errors';
import type { ApiError } from '../types';
import { logger } from '../../config/logger';
import { isProd } from '../../config/env';

/** 404 fallback for unmatched routes. */
export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiError = {
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  };
  res.status(404).json(body);
}

/**
 * Central error funnel. Normalises AppError, Zod, and Mongoose errors into the
 * single `ApiError` envelope, hides internals in production, and logs the rest.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong';
  let details: unknown;

  if (err instanceof AppError) {
    status = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Document validation failed';
    details = Object.values(err.errors).map((e) => e.message);
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = 'BAD_REQUEST';
    message = `Invalid ${err.path}`;
  } else if (isDuplicateKey(err)) {
    status = 409;
    code = 'CONFLICT';
    message = 'A record with these details already exists';
    details = err.keyValue;
  }

  if (status >= 500) {
    const reqId = (req as { id?: string }).id;
    logger.error({ err, reqId, path: req.path }, 'Unhandled error');
  } else {
    logger.warn({ code, path: req.path }, message);
  }

  const body: ApiError = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };

  // Never leak internals / stack traces to clients in production.
  if (status >= 500 && isProd) body.error.message = 'Something went wrong';

  res.status(status).json(body);
}

function isDuplicateKey(
  err: unknown,
): err is { code: number; keyValue: Record<string, unknown> } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: number }).code === 11000
  );
}

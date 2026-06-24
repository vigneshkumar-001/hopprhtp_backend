import type { NextFunction, Request, Response } from 'express';
import { z, ZodError, type ZodTypeAny } from 'zod';
import { UnprocessableEntity } from '../errors';

type Schemas = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

/**
 * Validates and (importantly) *coerces* request input against Zod schemas.
 * The parsed result replaces `req.body/query/params`, so controllers receive
 * fully-typed, trusted data — never raw user input.
 */
export const validate =
  (schemas: Schemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query)
        Object.assign(req.query, schemas.query.parse(req.query));
      if (schemas.params)
        Object.assign(req.params, schemas.params.parse(req.params));
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          UnprocessableEntity(
            'Request validation failed',
            err.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          ),
        );
        return;
      }
      next(err);
    }
  };

/** Helper to infer the body type from a schema for typed controllers. */
export type Body<S extends ZodTypeAny> = z.infer<S>;

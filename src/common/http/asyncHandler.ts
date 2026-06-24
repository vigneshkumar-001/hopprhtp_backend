import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route handler so any thrown/rejected error is forwarded to the
 * Express error middleware instead of crashing the process. Lets controllers be
 * written with plain `async/await` and no try/catch boilerplate.
 */
export const asyncHandler =
  <Req extends Request = Request>(
    fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    fn(req as Req, res, next).catch(next);
  };

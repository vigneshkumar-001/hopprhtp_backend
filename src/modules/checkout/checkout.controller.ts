import type { Request, Response } from 'express';
import { checkoutService } from './checkout.service';
import { ok } from '../../common/types';

export const checkoutController = {
  async get(req: Request, res: Response) {
    res.json(ok(await checkoutService.getByCode(req.params.code as string)));
  },

  async pay(req: Request, res: Response) {
    res.json(ok(await checkoutService.pay(req.params.code as string)));
  },
};

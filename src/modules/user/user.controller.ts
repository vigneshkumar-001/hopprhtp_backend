import type { Request, Response } from 'express';
import { userService } from './user.service';
import { ok } from '../../common/types';
import { Unauthorized } from '../../common/errors';

const uid = (req: Request): string => {
  if (!req.auth) throw Unauthorized();
  return req.auth.sub;
};

export const userController = {
  async me(req: Request, res: Response) {
    const user = await userService.getById(uid(req));
    res.json(ok(user.toJSON()));
  },

  async updateProfile(req: Request, res: Response) {
    const user = await userService.updateProfile(uid(req), req.body);
    res.json(ok(user.toJSON()));
  },

  async addPayoutAccount(req: Request, res: Response) {
    const user = await userService.addPayoutAccount(uid(req), req.body);
    res.status(201).json(ok(user.toJSON()));
  },

  async setDefaultPayoutAccount(req: Request, res: Response) {
    const user = await userService.setDefaultPayoutAccount(uid(req), req.params.id as string);
    res.json(ok(user.toJSON()));
  },

  async submitIdentity(req: Request, res: Response) {
    const user = await userService.submitIdentity(uid(req), req.body);
    res.json(ok(user.toJSON()));
  },
};

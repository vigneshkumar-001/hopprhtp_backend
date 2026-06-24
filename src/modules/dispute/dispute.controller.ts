import type { Request, Response } from 'express';
import { disputeService } from './dispute.service';
import { ok } from '../../common/types';
import { Unauthorized } from '../../common/errors';

function auth(req: Request) {
  if (!req.auth) throw Unauthorized();
  return req.auth;
}

export const disputeController = {
  async raise(req: Request, res: Response) {
    const dispute = await disputeService.raise(auth(req).sub, req.body);
    res.status(201).json(ok(dispute.toJSON()));
  },

  async getOne(req: Request, res: Response) {
    const { sub, role } = auth(req);
    const dispute = await disputeService.getForUser(req.params.id as string, sub, role);
    res.json(ok(dispute.toJSON()));
  },

  async resolve(req: Request, res: Response) {
    const dispute = await disputeService.resolve(req.params.id as string, auth(req).sub, req.body);
    res.json(ok(dispute.toJSON()));
  },
};

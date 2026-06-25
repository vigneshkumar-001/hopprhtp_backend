import type { Request, Response } from 'express';
import { supportService } from './support.service';
import { ok } from '../../common/types';
import { Unauthorized } from '../../common/errors';

function auth(req: Request) {
  if (!req.auth) throw Unauthorized();
  return req.auth;
}

export const supportController = {
  async overview(_req: Request, res: Response) {
    res.json(ok(supportService.overview()));
  },

  async createTicket(req: Request, res: Response) {
    const ticket = await supportService.createTicket(auth(req).sub, req.body);
    res.status(201).json(ok(ticket.toJSON()));
  },

  async listMine(req: Request, res: Response) {
    const tickets = await supportService.listMine(auth(req).sub);
    res.json(ok(tickets));
  },
};

import type { Request, Response } from 'express';
import { notificationService } from './notification.service';
import { ok } from '../../common/types';
import { Unauthorized } from '../../common/errors';

function uid(req: Request): string {
  if (!req.auth) throw Unauthorized();
  return req.auth.sub;
}

export const notificationController = {
  async list(req: Request, res: Response) {
    const { page, limit } = req.query as unknown as { page?: number; limit?: number };
    res.json(ok(await notificationService.listPaged(uid(req), { page, limit })));
  },

  async unreadCount(req: Request, res: Response) {
    res.json(ok({ unread: await notificationService.unreadCount(uid(req)) }));
  },

  async markRead(req: Request, res: Response) {
    await notificationService.markRead(req.params.id as string, uid(req));
    res.json(ok({ ok: true }));
  },

  async markAllRead(req: Request, res: Response) {
    await notificationService.markAllRead(uid(req));
    res.json(ok({ ok: true }));
  },
};

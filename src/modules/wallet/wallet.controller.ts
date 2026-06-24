import type { Request, Response } from 'express';
import { z } from 'zod';
import { walletService } from './wallet.service';
import { ok } from '../../common/types';
import { Unauthorized } from '../../common/errors';
import { nairaToKobo } from '../../common/utils/money';

const uid = (req: Request): string => {
  if (!req.auth) throw Unauthorized();
  return req.auth.sub;
};

export const withdrawSchema = z.object({
  amountNaira: z.number().positive(),
  accountId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid account id'),
});

export const ledgerQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
});

export const walletController = {
  async balance(req: Request, res: Response) {
    res.json(ok(await walletService.getBalance(uid(req))));
  },

  async ledger(req: Request, res: Response) {
    const { page, perPage } = req.query as unknown as { page: number; perPage: number };
    res.json(ok(await walletService.listLedger(uid(req), page, perPage)));
  },

  async withdraw(req: Request, res: Response) {
    const { amountNaira, accountId } = req.body as { amountNaira: number; accountId: string };
    const balance = await walletService.withdraw(uid(req), nairaToKobo(amountNaira), accountId);
    res.json(ok(balance));
  },
};

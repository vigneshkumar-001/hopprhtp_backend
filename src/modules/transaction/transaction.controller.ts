import type { Request, Response } from 'express';
import { transactionService } from './transaction.service';
import { ok } from '../../common/types';
import { Unauthorized } from '../../common/errors';
import { nairaToKobo } from '../../common/utils/money';
import type { TxStatus } from './transaction.model';
import type { CreateTransactionBody } from './transaction.schema';

const uid = (req: Request): string => {
  if (!req.auth) throw Unauthorized();
  return req.auth.sub;
};

export const transactionController = {
  async create(req: Request, res: Response) {
    const body = req.body as CreateTransactionBody;
    const tx = await transactionService.create(uid(req), {
      feeSplit: body.feeSplit,
      variant: body.variant,
      inspectionPeriodSeconds: body.inspectionPeriodSeconds,
      buyerEmail: body.buyerEmail,
      sellerEmail: body.sellerEmail,
      deliveryFeeKobo:
        body.deliveryFeeNaira != null ? nairaToKobo(body.deliveryFeeNaira) : undefined,
      consignments: body.consignments.map((c) => ({
        product: c.product,
        amountKobo: nairaToKobo(c.amountNaira),
        buyerContact: c.buyerContact,
        payout: c.payout,
        dispatchPhotoUrl: c.dispatchPhotoUrl,
        waybillImageUrl: c.waybillImageUrl,
      })),
    });
    res.status(201).json(ok(tx.toJSON()));
  },

  async list(req: Request, res: Response) {
    const { stage, status, role } = req.query as unknown as {
      stage?: 'active' | 'cooling' | 'done';
      status?: TxStatus;
      role?: 'seller' | 'buyer';
    };
    const txs = await transactionService.list(uid(req), { stage, status, role });
    res.json(ok(txs));
  },

  async getByCode(req: Request, res: Response) {
    res.json(ok(await transactionService.getByCode(req.params.code as string)));
  },

  async getOne(req: Request, res: Response) {
    res.json(ok(await transactionService.getForUser(req.params.id as string, uid(req))));
  },

  async agree(req: Request, res: Response) {
    const tx = await transactionService.agree(req.params.id as string, uid(req));
    res.json(ok(tx.toJSON()));
  },

  async fund(req: Request, res: Response) {
    const { tx, devOtp } = await transactionService.fund(req.params.id as string, uid(req));
    res.json(ok({ transaction: tx.toJSON(), ...(devOtp ? { devOtp } : {}) }));
  },

  async ship(req: Request, res: Response) {
    const { carrier, trackingNumber } = req.body as { carrier?: string; trackingNumber?: string };
    const tx = await transactionService.ship(req.params.id as string, uid(req), carrier, trackingNumber);
    res.json(ok(tx.toJSON()));
  },

  async outForDelivery(req: Request, res: Response) {
    const tx = await transactionService.markOutForDelivery(req.params.id as string, uid(req));
    res.json(ok(tx.toJSON()));
  },

  async confirmDelivery(req: Request, res: Response) {
    const { otp, lat, lng } = req.body as { otp: string; lat?: number; lng?: number };
    const location = lat != null && lng != null ? { lat, lng } : undefined;
    const tx = await transactionService.confirmDelivery(req.params.id as string, uid(req), otp, location);
    res.json(ok(tx.toJSON()));
  },

  async release(req: Request, res: Response) {
    const tx = await transactionService.release(req.params.id as string, uid(req));
    res.json(ok(tx.toJSON()));
  },

  async cancel(req: Request, res: Response) {
    const { reason } = req.body as { reason?: string };
    const tx = await transactionService.cancel(req.params.id as string, uid(req), reason);
    res.json(ok(tx.toJSON()));
  },
};

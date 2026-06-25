import type { Request, Response } from 'express';
import { transactionService } from './transaction.service';
import { notificationService } from '../notification/notification.service';
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
    const { stage, status, role, page, limit } = req.query as unknown as {
      stage?: 'active' | 'cooling' | 'done';
      status?: TxStatus;
      role?: 'seller' | 'buyer';
      page?: number;
      limit?: number;
    };
    const result = await transactionService.list(uid(req), {
      stage,
      status,
      role,
      page,
      limit,
    });
    res.json(ok(result));
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
    // Buyer just funded → tell the seller their escrow is secured.
    await notificationService.emit({
      userId: tx.sellerId.toString(),
      type: 'payment',
      title: 'Payment received',
      body: `${tx.code} · funds are now secured in escrow`,
      transactionId: tx.id,
      code: tx.code,
    });
    res.json(ok({ transaction: tx.toJSON(), ...(devOtp ? { devOtp } : {}) }));
  },

  async ship(req: Request, res: Response) {
    const { carrier, trackingNumber } = req.body as { carrier?: string; trackingNumber?: string };
    const tx = await transactionService.ship(req.params.id as string, uid(req), carrier, trackingNumber);
    if (tx.buyerId) {
      await notificationService.emit({
        userId: tx.buyerId.toString(),
        type: 'delivery',
        title: 'On its way',
        body: `${tx.code} · your order has been dispatched`,
        transactionId: tx.id,
        code: tx.code,
      });
    }
    res.json(ok(tx.toJSON()));
  },

  async outForDelivery(req: Request, res: Response) {
    const tx = await transactionService.markOutForDelivery(req.params.id as string, uid(req));
    if (tx.buyerId) {
      await notificationService.emit({
        userId: tx.buyerId.toString(),
        type: 'delivery',
        title: 'Out for delivery',
        body: `${tx.code} · the dispatcher is on the way to you`,
        transactionId: tx.id,
        code: tx.code,
      });
    }
    res.json(ok(tx.toJSON()));
  },

  async confirmDelivery(req: Request, res: Response) {
    const { otp, lat, lng } = req.body as { otp: string; lat?: number; lng?: number };
    const location = lat != null && lng != null ? { lat, lng } : undefined;
    const tx = await transactionService.confirmDelivery(req.params.id as string, uid(req), otp, location);
    // Delivery confirmed → tell the seller the cooling period has started.
    await notificationService.emit({
      userId: tx.sellerId.toString(),
      type: 'delivery',
      title: 'Delivery confirmed',
      body: `${tx.code} · cooling period started`,
      transactionId: tx.id,
      code: tx.code,
    });
    res.json(ok(tx.toJSON()));
  },

  async release(req: Request, res: Response) {
    const tx = await transactionService.release(req.params.id as string, uid(req));
    await notificationService.emit({
      userId: tx.sellerId.toString(),
      type: 'payout',
      title: 'Funds released',
      body: `${tx.code} · the escrow has been released to you`,
      transactionId: tx.id,
      code: tx.code,
    });
    res.json(ok(tx.toJSON()));
  },

  async cancel(req: Request, res: Response) {
    const { reason } = req.body as { reason?: string };
    const tx = await transactionService.cancel(req.params.id as string, uid(req), reason);
    res.json(ok(tx.toJSON()));
  },
};

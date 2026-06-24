import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { safeEqual } from '../../common/utils/codes';
import { Unauthorized } from '../../common/errors';
import { TransactionModel, type TxStatus } from '../transaction/transaction.model';

/**
 * Maps inbound Escrow.com webhook event names to our internal status. We only
 * *reconcile* status here — money movements are driven by our own endpoints so
 * a replayed webhook can never double-pay.
 */
const EVENT_TO_STATUS: Record<string, TxStatus> = {
  'transaction.agreed': 'awaiting_payment',
  'transaction.funded': 'payment_received',
  'transaction.shipped': 'in_transit',
  'transaction.received': 'cooling',
  'transaction.accepted': 'released',
  'transaction.disputed': 'disputed',
  'transaction.refunded': 'refunded',
  'transaction.disbursed': 'completed',
  'transaction.completed': 'completed',
  'transaction.cancelled': 'cancelled',
};

function verifySignature(req: Request): void {
  if (!env.ESCROW_WEBHOOK_SECRET) {
    // No secret configured (local dev) — accept but warn.
    logger.warn('ESCROW_WEBHOOK_SECRET not set — skipping signature verification');
    return;
  }
  const signature = req.header('x-escrow-signature') ?? '';
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const expected = crypto
    .createHmac('sha256', env.ESCROW_WEBHOOK_SECRET)
    .update(raw)
    .digest('hex');
  if (!signature || !safeEqual(signature, expected)) {
    throw Unauthorized('Invalid webhook signature');
  }
}

export const webhookController = {
  async escrow(req: Request, res: Response) {
    verifySignature(req);

    const payload = Buffer.isBuffer(req.body)
      ? (JSON.parse(req.body.toString('utf8')) as Record<string, unknown>)
      : (req.body as Record<string, unknown>);

    const event = String(payload.event ?? payload.type ?? '');
    const escrowTransactionId = String(
      (payload.transaction_id as string | number | undefined) ??
        ((payload.transaction as { id?: string | number } | undefined)?.id ?? ''),
    );

    logger.info({ event, escrowTransactionId }, 'Escrow.com webhook received');

    const mapped = EVENT_TO_STATUS[event];
    if (mapped && escrowTransactionId) {
      const tx = await TransactionModel.findOne({ escrowTransactionId });
      if (tx && tx.status !== mapped) {
        tx.pushEvent('webhook', { event, from: tx.status, to: mapped });
        tx.status = mapped;
        await tx.save();
      }
    }

    // Always 200 quickly so Escrow.com doesn't retry a processed event.
    res.status(200).json({ received: true });
  },
};

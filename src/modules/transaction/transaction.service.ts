import { Types } from 'mongoose';
import {
  TransactionModel,
  stageForStatus,
  statusesForStage,
  type TransactionDocument,
  type TxStage,
  type TxStatus,
} from './transaction.model';
import { nextStatus, type TxAction } from './transaction.stateMachine';
import { computeFees, type FeeSplit } from '../../common/utils/money';
import { generateTransactionCode, generateNumericOtp, randomToken } from '../../common/utils/codes';
import { hashSecret, verifySecret } from '../../common/utils/password';
import { BadRequest, Forbidden, NotFound } from '../../common/errors';
import { env, isProd } from '../../config/env';
import { logger } from '../../config/logger';
import { escrowService, type EscrowParty } from '../escrow/escrow.service';
import { walletService } from '../wallet/wallet.service';
import { UserModel } from '../user/user.model';

export interface CreateConsignmentInput {
  product: string;
  amountKobo: number;
  quantity?: string;
  weight?: string;
  buyerName?: string;
  buyerContact: string;
  deliveryAddress?: string;
  waybillTrackingNumber?: string;
  payout?: {
    dispatcherName: string;
    dispatcherPhone: string;
    bank: string;
    accountNumber: string;
    accountName: string;
  };
  dispatcherAddress?: string;
  specialInstructions?: string;
  dispatchPhotoUrl?: string;
  waybillImageUrl?: string;
}

export interface CreateTransactionInput {
  consignments: CreateConsignmentInput[];
  feeSplit: FeeSplit;
  deliveryFeeKobo?: number;
  variant?: string;
  inspectionPeriodSeconds?: number;
  buyerEmail?: string; // for the Escrow.com party mapping
  sellerEmail?: string;
}

/** Great-circle distance in metres (geofence check). */
function haversineMetres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function loadOwned(
  id: string,
  userId: string,
  opts: { role?: 'seller' | 'buyer' | 'any'; withOtp?: boolean } = {},
): Promise<TransactionDocument> {
  const role = opts.role ?? 'any';
  // `.select()` mutates the query in place; call it for its side effect rather
  // than reassigning (the returned query type differs under NodeNext resolution).
  const q = TransactionModel.findById(id);
  if (opts.withOtp) q.select('+delivery.otpHash');
  const tx = await q.exec();
  if (!tx) throw NotFound('Transaction not found');

  const isSeller = tx.sellerId.toString() === userId;
  const isBuyer = tx.buyerId?.toString() === userId;
  const allowed =
    role === 'any' ? isSeller || isBuyer : role === 'seller' ? isSeller : isBuyer;
  if (!allowed) throw Forbidden('You are not a party to this transaction');
  return tx;
}

export const transactionService = {
  async create(sellerId: string, input: CreateTransactionInput): Promise<TransactionDocument> {
    if (input.consignments.length === 0) throw BadRequest('At least one consignment is required');

    const seller = await UserModel.findById(sellerId).lean();
    if (!seller) throw NotFound('Seller not found');

    const itemSubtotalKobo = input.consignments.reduce((sum, c) => sum + c.amountKobo, 0);
    const fees = computeFees({
      itemSubtotalKobo,
      deliveryFeeKobo: input.deliveryFeeKobo,
      feeSplit: input.feeSplit,
    });

    const primary = input.consignments[0]!;
    const code = generateTransactionCode();
    const reference = `HTP-${randomToken(8)}`;

    const tx = await TransactionModel.create({
      code,
      reference,
      sellerId,
      merchantName: seller.fullName,
      buyerContact: primary.buyerContact,
      productName:
        input.consignments.length > 1
          ? `${primary.product} +${input.consignments.length - 1} more`
          : primary.product,
      variant: input.variant,
      consignments: input.consignments.map((c) => ({
        product: c.product,
        amountKobo: c.amountKobo,
        quantity: c.quantity,
        weight: c.weight,
        buyerName: c.buyerName,
        buyerContact: c.buyerContact,
        deliveryAddress: c.deliveryAddress,
        waybillTrackingNumber: c.waybillTrackingNumber,
        payout: c.payout
          ? {
              dispatcherName: c.payout.dispatcherName,
              dispatcherPhone: c.payout.dispatcherPhone,
              bank: c.payout.bank,
              accountNumberLast4: c.payout.accountNumber.slice(-4),
              // NOTE: encrypt c.payout.accountNumber at rest before going live.
              accountName: c.payout.accountName,
            }
          : undefined,
        dispatcherAddress: c.dispatcherAddress,
        specialInstructions: c.specialInstructions,
        dispatchPhotoUrl: c.dispatchPhotoUrl,
        waybillImageUrl: c.waybillImageUrl,
      })),
      currency: 'NGN',
      itemSubtotalKobo: fees.itemSubtotal,
      deliveryFeeKobo: fees.deliveryFee,
      trustFullKobo: fees.trustFull,
      buyerTrustShareKobo: fees.buyerTrustShare,
      sellerTrustShareKobo: fees.sellerTrustShare,
      grandTotalKobo: fees.grandTotal,
      feeSplit: fees.feeSplit,
      status: 'awaiting_agreement',
      inspectionPeriodSeconds: input.inspectionPeriodSeconds ?? 86400,
      timeline: [{ event: 'created', at: new Date() }],
    });

    // Best-effort upstream creation; failures never block the local flow.
    if (input.buyerEmail && input.sellerEmail) {
      const parties: EscrowParty[] = [
        { role: 'buyer', email: input.buyerEmail },
        { role: 'seller', email: input.sellerEmail },
      ];
      escrowService
        .createTransaction({
          reference,
          description: tx.productName,
          parties,
          items: input.consignments.map((c) => ({
            title: c.product,
            amountKobo: c.amountKobo,
            inspectionPeriodSeconds: tx.inspectionPeriodSeconds,
            buyerEmail: input.buyerEmail!,
            sellerEmail: input.sellerEmail!,
          })),
        })
        .then((r) => {
          if (r.escrowTransactionId) {
            return TransactionModel.updateOne(
              { _id: tx.id },
              { escrowTransactionId: r.escrowTransactionId },
            );
          }
          return undefined;
        })
        .catch((err) => logger.warn({ err }, 'escrow createTransaction failed'));
    }

    return tx;
  },

  async list(
    userId: string,
    filters: {
      stage?: TxStage;
      status?: TxStatus;
      role?: 'seller' | 'buyer';
      page?: number;
      limit?: number;
    },
  ) {
    const party =
      filters.role === 'seller'
        ? { sellerId: userId }
        : filters.role === 'buyer'
          ? { buyerId: userId }
          : { $or: [{ sellerId: userId }, { buyerId: userId }] };

    const query: Record<string, unknown> = { ...party };
    // Filter by stage at the DB level (via its status set) so paging is exact.
    if (filters.status) query.status = filters.status;
    else if (filters.stage) query.status = { $in: statusesForStage(filters.stage) };

    const page = Math.max(1, filters.page ?? 1);
    const limit = filters.limit ? Math.min(100, Math.max(1, filters.limit)) : 200;
    const skip = (page - 1) * limit;

    const [total, docs] = await Promise.all([
      TransactionModel.countDocuments(query),
      TransactionModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    // `stage` is a virtual — lean() skips it, so derive it explicitly here.
    const items = docs.map((t) => ({ ...t, stage: stageForStatus(t.status) }));
    return { items, page, limit, total, hasMore: skip + docs.length < total };
  },

  async getByCode(code: string) {
    const tx = await TransactionModel.findOne({ code: code.trim().toUpperCase() }).lean();
    if (!tx) throw NotFound('No transaction with that code');
    return { ...tx, stage: stageForStatus(tx.status) };
  },

  async getForUser(id: string, userId: string) {
    const tx = await loadOwned(id, userId);
    return tx.toJSON();
  },

  // ─── Lifecycle actions ────────────────────────────────────────────────────

  /** Buyer agrees to terms. */
  async agree(id: string, userId: string): Promise<TransactionDocument> {
    const tx = await loadOwned(id, userId);
    tx.status = applyTransition('agree', tx.status, tx);
    await escrowService.action(tx.escrowTransactionId, 'agree');
    await tx.save();
    return tx;
  },

  /** Buyer funds escrow. Generates the dispatcher delivery OTP. */
  async fund(id: string, buyerUserId: string): Promise<{ tx: TransactionDocument; devOtp?: string }> {
    const tx = await loadOwnedForFunding(id, buyerUserId);
    tx.status = applyTransition('fund', tx.status, tx);
    if (!tx.buyerId) tx.buyerId = new Types.ObjectId(buyerUserId);

    const otp = generateNumericOtp(6);
    tx.delivery.otpHash = await hashSecret(otp);
    tx.delivery.otpExpiresAt = new Date(Date.now() + env.DELIVERY_OTP_TTL_DAYS * 86400_000);
    tx.pushEvent('escrow_funded', { amountKobo: tx.grandTotalKobo });

    await escrowService.action(tx.escrowTransactionId, 'fund');

    // Lock the item value into the seller's escrow bucket + ledger.
    await walletService.move({
      userId: tx.sellerId.toString(),
      type: 'escrow_funded',
      amountKobo: tx.itemSubtotalKobo,
      bucket: 'escrow',
      transactionId: tx.id,
      description: `Escrow funded for ${tx.code}`,
    });

    await tx.save();
    logger.info({ code: tx.code, dispatcher: tx.consignments[0]?.payout?.dispatcherPhone }, 'delivery OTP issued');
    return { tx, devOtp: isProd ? undefined : otp };
  },

  /** Seller marks shipped + records tracking. */
  async ship(id: string, userId: string, carrier?: string, trackingNumber?: string): Promise<TransactionDocument> {
    const tx = await loadOwned(id, userId, { role: 'seller' });
    tx.status = applyTransition('ship', tx.status, tx);
    if (carrier) tx.delivery.trackingCarrier = carrier;
    if (trackingNumber) tx.delivery.trackingNumber = trackingNumber;
    tx.pushEvent('shipped', { carrier, trackingNumber });
    await escrowService.action(tx.escrowTransactionId, 'ship');
    if (carrier && trackingNumber) {
      await escrowService.action(tx.escrowTransactionId, 'ship', {
        action: 'update_tracking',
        carrier,
        tracking_number: trackingNumber,
      });
    }
    await tx.save();
    return tx;
  },

  async markOutForDelivery(id: string, userId: string): Promise<TransactionDocument> {
    const tx = await loadOwned(id, userId, { role: 'seller' });
    tx.status = applyTransition('out_for_delivery', tx.status, tx);
    tx.pushEvent('out_for_delivery');
    await tx.save();
    return tx;
  },

  /**
   * Buyer confirms delivery with the dispatcher OTP. Enforces the geofence when
   * a delivery location was set. On success: pays the dispatcher and moves the
   * item value into the seller's cooling bucket.
   */
  async confirmDelivery(
    id: string,
    buyerUserId: string,
    otp: string,
    location?: { lat: number; lng: number },
  ): Promise<TransactionDocument> {
    const tx = await loadOwned(id, buyerUserId, { role: 'any', withOtp: true });

    if (!tx.delivery.otpHash || !tx.delivery.otpExpiresAt) throw BadRequest('Delivery OTP not issued yet');
    if (tx.delivery.otpExpiresAt < new Date()) throw BadRequest('Delivery OTP has expired');

    // Geofence: only enforced when a centre was configured for this delivery.
    if (tx.delivery.geofenceLat != null && tx.delivery.geofenceLng != null) {
      if (!location) throw BadRequest('Location required to confirm delivery');
      const distance = haversineMetres(
        tx.delivery.geofenceLat,
        tx.delivery.geofenceLng,
        location.lat,
        location.lng,
      );
      if (distance > tx.delivery.geofenceRadiusM) {
        throw BadRequest('You must be at the delivery location to confirm');
      }
    }

    const valid = await verifySecret(tx.delivery.otpHash, otp);
    if (!valid) throw BadRequest('Incorrect delivery code');

    tx.status = applyTransition('confirm_delivery', tx.status, tx);
    tx.delivery.confirmedAt = new Date();
    tx.delivery.otpHash = undefined;
    tx.coolingEndsAt = new Date(Date.now() + tx.inspectionPeriodSeconds * 1000);
    tx.pushEvent('delivered');
    tx.pushEvent('cooling_started', { endsAt: tx.coolingEndsAt });

    await escrowService.action(tx.escrowTransactionId, 'receive');

    const sellerId = tx.sellerId.toString();
    const sellerNetKobo = tx.itemSubtotalKobo - tx.sellerTrustShareKobo;

    // Delivery fee → dispatcher (external payout, informational ledger entry).
    await walletService.move({
      userId: sellerId,
      type: 'delivery_payout',
      amountKobo: -tx.deliveryFeeKobo,
      bucket: 'escrow',
      transactionId: tx.id,
      description: `Delivery fee released to ${tx.consignments[0]?.payout?.dispatcherName ?? 'dispatcher'}`,
    });

    // Item value (net of Hoppr's trust share) → seller cooling bucket.
    await walletService.move({
      userId: sellerId,
      type: 'escrow_funded',
      amountKobo: -tx.itemSubtotalKobo,
      bucket: 'escrow',
      transactionId: tx.id,
      description: `Released from escrow for ${tx.code}`,
    });
    await walletService.move({
      userId: sellerId,
      type: 'seller_payout',
      amountKobo: sellerNetKobo,
      bucket: 'cooling',
      transactionId: tx.id,
      description: `Settlement cooling for ${tx.code}`,
    });

    await tx.save();
    return tx;
  },

  /** Release after cooling (or buyer accepts early). Moves cooling → available. */
  async release(id: string, actorUserId?: string): Promise<TransactionDocument> {
    const tx = actorUserId ? await loadOwned(id, actorUserId) : await mustGet(id);
    tx.status = applyTransition('release', tx.status, tx);

    const sellerId = tx.sellerId.toString();
    const sellerNetKobo = tx.itemSubtotalKobo - tx.sellerTrustShareKobo;

    await walletService.move({
      userId: sellerId,
      type: 'seller_payout',
      amountKobo: -sellerNetKobo,
      bucket: 'cooling',
      transactionId: tx.id,
      description: `Cooling cleared for ${tx.code}`,
    });
    await walletService.move({
      userId: sellerId,
      type: 'seller_payout',
      amountKobo: sellerNetKobo,
      bucket: 'available',
      transactionId: tx.id,
      description: `Funds released for ${tx.code}`,
    });

    tx.status = 'completed';
    tx.pushEvent('funds_released', { sellerNetKobo });

    await escrowService.action(tx.escrowTransactionId, 'accept');
    await escrowService.action(tx.escrowTransactionId, 'disburse', {
      disbursement_method: { type: 'ach' },
    });

    // Reward a clean transaction.
    await UserModel.updateOne(
      { _id: sellerId },
      { $inc: { deals: 1, trustScore: 2 } },
    );
    await UserModel.updateOne(
      { _id: sellerId, trustScore: { $gt: 100 } },
      { $set: { trustScore: 100 } },
    );

    await tx.save();
    return tx;
  },

  async cancel(id: string, userId: string, reason?: string): Promise<TransactionDocument> {
    const tx = await loadOwned(id, userId);
    tx.status = applyTransition('cancel', tx.status, tx);
    tx.pushEvent('cancelled', { reason });
    await escrowService.action(tx.escrowTransactionId, 'cancel', reason ? { reason } : {});
    await tx.save();
    return tx;
  },

  /**
   * Public hosted-checkout payment by code (the buyer pays from the link, no
   * account). Moves agreement → funded, locks the item value into the seller's
   * escrow bucket and issues the delivery OTP. Idempotent once paid. In a real
   * deployment the actual card charge is done by a gateway/webhook; this records
   * the escrow funding once payment succeeds.
   */
  async payByCode(code: string): Promise<TransactionDocument> {
    const tx = await TransactionModel.findOne({ code: code.trim().toUpperCase() }).select(
      '+delivery.otpHash',
    );
    if (!tx) throw NotFound('No transaction with that code');

    const paidStatuses: TxStatus[] = [
      'payment_received', 'awaiting_dispatch', 'in_transit', 'out_for_delivery',
      'delivered', 'cooling', 'released', 'completed',
    ];
    if (paidStatuses.includes(tx.status)) return tx; // already paid — idempotent

    if (tx.status === 'draft' || tx.status === 'awaiting_agreement') {
      tx.status = applyTransition('agree', tx.status, tx);
    }
    if (tx.status !== 'awaiting_payment') {
      throw BadRequest('This transaction can no longer be paid');
    }

    tx.status = applyTransition('fund', tx.status, tx);
    const otp = generateNumericOtp(6);
    tx.delivery.otpHash = await hashSecret(otp);
    tx.delivery.otpExpiresAt = new Date(Date.now() + env.DELIVERY_OTP_TTL_DAYS * 86400_000);
    tx.pushEvent('escrow_funded', { amountKobo: tx.grandTotalKobo });

    await walletService.move({
      userId: tx.sellerId.toString(),
      type: 'escrow_funded',
      amountKobo: tx.itemSubtotalKobo,
      bucket: 'escrow',
      transactionId: tx.id,
      description: `Escrow funded for ${tx.code}`,
    });

    await tx.save();
    return tx;
  },
};

// ── internal helpers ────────────────────────────────────────────────────────

function applyTransition(action: TxAction, current: TxStatus, tx: TransactionDocument): TxStatus {
  const to = nextStatus(action, current);
  return to;
}

async function mustGet(id: string): Promise<TransactionDocument> {
  const tx = await TransactionModel.findById(id);
  if (!tx) throw NotFound('Transaction not found');
  return tx;
}

/** Funding can be done by an already-linked buyer, or claims an unclaimed tx. */
async function loadOwnedForFunding(id: string, buyerUserId: string): Promise<TransactionDocument> {
  const tx = await mustGet(id);
  if (tx.buyerId && tx.buyerId.toString() !== buyerUserId && tx.sellerId.toString() !== buyerUserId) {
    throw Forbidden('You are not a party to this transaction');
  }
  return tx;
}

import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import type { FeeSplit } from '../../common/utils/money';

/**
 * Canonical lifecycle status. This is the single source of truth that the
 * Flutter `TxStatus`/`TxStage` enums and the Escrow.com lifecycle both map to.
 */
export const TX_STATUSES = [
  'draft',
  'awaiting_agreement',
  'awaiting_payment',
  'payment_received',
  'awaiting_dispatch',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'cooling',
  'released',
  'completed',
  'disputed',
  'refunded',
  'returned',
  'cancelled',
  'undeliverable',
] as const;
export type TxStatus = (typeof TX_STATUSES)[number];

export type TxStage = 'active' | 'cooling' | 'done';

/** Home-tab bucket derived from the granular status. */
export function stageForStatus(status: TxStatus): TxStage {
  switch (status) {
    case 'cooling':
    case 'disputed':
      return 'cooling';
    case 'released':
    case 'completed':
    case 'refunded':
    case 'returned':
    case 'cancelled':
    case 'undeliverable':
      return 'done';
    default:
      return 'active';
  }
}

/** Reverse of [stageForStatus] — the statuses that fall under a home-tab stage.
 *  Lets the list query filter by stage at the DB level (so pagination is exact). */
export function statusesForStage(stage: TxStage): TxStatus[] {
  return TX_STATUSES.filter((s) => stageForStatus(s) === stage);
}

export interface CourierPayoutSub {
  dispatcherName: string;
  dispatcherPhone: string;
  bank: string;
  accountNumberLast4: string;
  accountNumberEnc?: string; // encrypted-at-rest full number (select:false)
  accountName: string;
}

export interface ConsignmentSub {
  product: string;
  amountKobo: number;
  buyerContact: string;
  payout?: CourierPayoutSub;
  dispatchPhotoUrl?: string;
  waybillImageUrl?: string;
}

export interface TimelineEvent {
  event: string;
  at: Date;
  meta?: Record<string, unknown>;
}

export interface DeliverySub {
  otpHash?: string; // argon2 of the dispatcher OTP (select:false)
  otpExpiresAt?: Date;
  geofenceLat?: number;
  geofenceLng?: number;
  geofenceRadiusM: number;
  confirmedAt?: Date;
  trackingCarrier?: string;
  trackingNumber?: string;
}

export interface TransactionDoc {
  _id: Types.ObjectId;
  code: string;
  reference: string;

  sellerId: Types.ObjectId; // creator / merchant
  buyerId?: Types.ObjectId; // set once the buyer links / pays
  merchantName: string;
  buyerContact: string;

  productName: string;
  variant?: string;
  consignments: ConsignmentSub[];

  currency: string;
  itemSubtotalKobo: number;
  deliveryFeeKobo: number;
  trustFullKobo: number;
  buyerTrustShareKobo: number;
  sellerTrustShareKobo: number;
  grandTotalKobo: number;
  feeSplit: FeeSplit;

  status: TxStatus;
  inspectionPeriodSeconds: number; // cooling window
  coolingEndsAt?: Date;
  delivery: DeliverySub;

  escrowTransactionId?: string;
  escrowPayToken?: string;
  escrowLandingPage?: string;

  timeline: TimelineEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionMethods {
  pushEvent(event: string, meta?: Record<string, unknown>): void;
}
export interface TransactionVirtuals {
  stage: TxStage;
}
export type TransactionModelType = Model<
  TransactionDoc,
  Record<string, never>,
  TransactionMethods,
  TransactionVirtuals
>;
export type TransactionDocument = HydratedDocument<
  TransactionDoc,
  TransactionMethods & TransactionVirtuals
>;

const PayoutSchema = new Schema<CourierPayoutSub>(
  {
    dispatcherName: { type: String, required: true },
    dispatcherPhone: { type: String, required: true },
    bank: { type: String, required: true },
    accountNumberLast4: { type: String, required: true },
    accountNumberEnc: { type: String, select: false },
    accountName: { type: String, required: true },
  },
  { _id: false },
);

const ConsignmentSchema = new Schema<ConsignmentSub>(
  {
    product: { type: String, required: true },
    amountKobo: { type: Number, required: true, min: 0 },
    buyerContact: { type: String, required: true },
    payout: { type: PayoutSchema, required: false },
    dispatchPhotoUrl: String,
    waybillImageUrl: String,
  },
  { _id: false },
);

const TransactionSchema = new Schema<
  TransactionDoc,
  TransactionModelType,
  TransactionMethods,
  Record<string, never>,
  TransactionVirtuals
>(
  {
    code: { type: String, required: true, unique: true, index: true },
    reference: { type: String, required: true, unique: true },

    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    merchantName: { type: String, required: true },
    buyerContact: { type: String, required: true },

    productName: { type: String, required: true },
    variant: String,
    consignments: { type: [ConsignmentSchema], default: [] },

    currency: { type: String, default: 'NGN' },
    itemSubtotalKobo: { type: Number, required: true, min: 0 },
    deliveryFeeKobo: { type: Number, required: true, min: 0 },
    trustFullKobo: { type: Number, required: true, min: 0 },
    buyerTrustShareKobo: { type: Number, required: true, min: 0 },
    sellerTrustShareKobo: { type: Number, required: true, min: 0 },
    grandTotalKobo: { type: Number, required: true, min: 0 },
    feeSplit: { type: String, enum: ['buyer', 'split', 'seller'], default: 'split' },

    status: { type: String, enum: TX_STATUSES, default: 'awaiting_agreement', index: true },
    inspectionPeriodSeconds: { type: Number, default: 86400 }, // 24h default
    coolingEndsAt: Date,
    delivery: {
      otpHash: { type: String, select: false },
      otpExpiresAt: Date,
      geofenceLat: Number,
      geofenceLng: Number,
      geofenceRadiusM: { type: Number, default: 200 },
      confirmedAt: Date,
      trackingCarrier: String,
      trackingNumber: String,
    },

    escrowTransactionId: { type: String, index: true },
    escrowPayToken: String,
    escrowLandingPage: String,

    timeline: {
      type: [
        new Schema<TimelineEvent>(
          { event: String, at: Date, meta: Schema.Types.Mixed },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete (ret as Record<string, unknown>).__v;
        if (ret.delivery) {
          delete (ret.delivery as unknown as Record<string, unknown>).otpHash;
        }
        return ret;
      },
    },
  },
);

// Fast Home-tab + history queries.
TransactionSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
TransactionSchema.index({ buyerId: 1, status: 1, createdAt: -1 });

TransactionSchema.virtual('stage').get(function stage(this: TransactionDoc) {
  return stageForStatus(this.status);
});

TransactionSchema.methods.pushEvent = function pushEvent(
  this: TransactionDocument,
  event: string,
  meta?: Record<string, unknown>,
) {
  this.timeline.push({ event, at: new Date(), meta });
};

export const TransactionModel = model<TransactionDoc, TransactionModelType>(
  'Transaction',
  TransactionSchema,
);

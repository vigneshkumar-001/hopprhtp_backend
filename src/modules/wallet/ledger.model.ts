import { Schema, model, type Model, type Types } from 'mongoose';

/**
 * Append-only money-movement log. Every credit/debit to any wallet bucket is
 * written here first, giving a tamper-evident audit trail you can replay to
 * reconstruct a balance. Entries are never updated or deleted.
 */
export const LEDGER_TYPES = [
  'escrow_funded', // buyer paid into escrow
  'delivery_payout', // delivery fee released to the dispatcher
  'seller_payout', // item value released to the seller
  'buyer_refund', // funds returned to the buyer
  'trust_fee', // Hoppr's retained trust-protection fee
  'withdrawal', // seller/buyer cashes out to bank
  'adjustment', // manual correction
] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export interface LedgerEntryDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: LedgerType;
  /** Signed minor units: positive = credit to the user, negative = debit. */
  amountKobo: number;
  bucket: 'available' | 'cooling' | 'escrow' | 'external';
  balanceAfterKobo?: number;
  transactionId?: Types.ObjectId;
  description: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const LedgerEntrySchema = new Schema<LedgerEntryDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: LEDGER_TYPES, required: true },
    amountKobo: { type: Number, required: true },
    bucket: { type: String, enum: ['available', 'cooling', 'escrow', 'external'], required: true },
    balanceAfterKobo: Number,
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction', index: true },
    description: { type: String, required: true },
    meta: Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

LedgerEntrySchema.index({ userId: 1, createdAt: -1 });

export const LedgerEntryModel: Model<LedgerEntryDoc> = model<LedgerEntryDoc>(
  'LedgerEntry',
  LedgerEntrySchema,
);

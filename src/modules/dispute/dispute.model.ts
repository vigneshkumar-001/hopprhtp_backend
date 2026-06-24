import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const DISPUTE_CATEGORIES = [
  'item_not_as_described',
  'not_delivered',
  'damaged_item',
  'fraud',
  'other',
] as const;
export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];

export type DisputeStatus = 'raised' | 'under_review' | 'frozen' | 'resolved';
export type DisputeOutcome = 'buyer_favored' | 'seller_favored';

export interface Evidence {
  type: 'image' | 'document' | 'text';
  url?: string;
  note?: string;
}

export interface AiAssessment {
  evidenceCompleteness: number; // 0..1
  fraudRiskScore: number; // 0..1
  summary: string;
  assessedAt: Date;
}

export interface DisputeDoc {
  _id: Types.ObjectId;
  code: string;
  transactionId: Types.ObjectId;
  raisedById: Types.ObjectId;
  raisedByRole: 'buyer' | 'seller';
  category: DisputeCategory;
  reason?: string;
  status: DisputeStatus;
  evidence: Evidence[];
  ai?: AiAssessment;
  resolution?: {
    outcome: DisputeOutcome;
    decidedById?: Types.ObjectId;
    decidedBy: 'manual_review' | 'ai_flagged';
    note?: string;
    at: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export type DisputeDocument = HydratedDocument<DisputeDoc>;

const DisputeSchema = new Schema<DisputeDoc>(
  {
    code: { type: String, required: true, unique: true, index: true },
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true, index: true },
    raisedById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    raisedByRole: { type: String, enum: ['buyer', 'seller'], required: true },
    category: { type: String, enum: DISPUTE_CATEGORIES, required: true },
    reason: String,
    status: { type: String, enum: ['raised', 'under_review', 'frozen', 'resolved'], default: 'raised', index: true },
    evidence: {
      type: [
        new Schema<Evidence>(
          { type: { type: String, enum: ['image', 'document', 'text'] }, url: String, note: String },
          { _id: false },
        ),
      ],
      default: [],
    },
    ai: {
      type: new Schema<AiAssessment>(
        {
          evidenceCompleteness: Number,
          fraudRiskScore: Number,
          summary: String,
          assessedAt: Date,
        },
        { _id: false },
      ),
    },
    resolution: {
      type: new Schema(
        {
          outcome: { type: String, enum: ['buyer_favored', 'seller_favored'] },
          decidedById: { type: Schema.Types.ObjectId, ref: 'User' },
          decidedBy: { type: String, enum: ['manual_review', 'ai_flagged'] },
          note: String,
          at: Date,
        },
        { _id: false },
      ),
    },
  },
  { timestamps: true, toJSON: { transform(_d, ret) { delete (ret as Record<string, unknown>).__v; return ret; } } },
);

export const DisputeModel: Model<DisputeDoc> = model<DisputeDoc>('Dispute', DisputeSchema);

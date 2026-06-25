import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const SUPPORT_CATEGORIES = [
  'account',
  'transactions',
  'payments',
  'disputes',
  'verification',
  'other',
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface SupportTicketDoc {
  _id: Types.ObjectId;
  code: string;
  userId: Types.ObjectId;
  category: SupportCategory;
  subject: string;
  message: string;
  status: SupportStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type SupportTicketDocument = HydratedDocument<SupportTicketDoc>;

const SupportTicketSchema = new Schema<SupportTicketDoc>(
  {
    code: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, enum: SUPPORT_CATEGORIES, required: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_d, ret) {
        delete (ret as Record<string, unknown>).__v;
        return ret;
      },
    },
  },
);

export const SupportTicketModel: Model<SupportTicketDoc> = model<SupportTicketDoc>(
  'SupportTicket',
  SupportTicketSchema,
);

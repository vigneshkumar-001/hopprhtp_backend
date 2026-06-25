import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'transaction',
  'payment',
  'delivery',
  'dispute',
  'payout',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  transactionId?: Types.ObjectId;
  code?: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationDocument = HydratedDocument<NotificationDoc>;

const NotificationSchema = new Schema<NotificationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, default: 'system' },
    title: { type: String, required: true },
    body: { type: String, required: true },
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
    code: String,
    read: { type: Boolean, default: false, index: true },
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

// Fast "my notifications, newest first" + unread lookups.
NotificationSchema.index({ userId: 1, createdAt: -1 });

export const NotificationModel: Model<NotificationDoc> = model<NotificationDoc>(
  'Notification',
  NotificationSchema,
);

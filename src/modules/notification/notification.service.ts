import { Types } from 'mongoose';
import { NotificationModel, type NotificationType } from './notification.model';
import { logger } from '../../config/logger';

interface CreateInput {
  userId: string | Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  transactionId?: string | Types.ObjectId;
  code?: string;
}

export const notificationService = {
  async create(input: CreateInput) {
    return NotificationModel.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      transactionId: input.transactionId,
      code: input.code,
      read: false,
    });
  },

  /**
   * Fire-and-forget create used by transaction lifecycle hooks — a notification
   * failure must NEVER break the underlying action, so it only logs on error.
   */
  async emit(input: CreateInput): Promise<void> {
    try {
      await this.create(input);
    } catch (err) {
      logger.warn({ err }, 'notification emit failed');
    }
  },

  async listPaged(userId: string, opts: { page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const [total, unread, items] = await Promise.all([
      NotificationModel.countDocuments({ userId }),
      NotificationModel.countDocuments({ userId, read: false }),
      NotificationModel.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    return { items, page, limit, total, unread, hasMore: skip + items.length < total };
  },

  async unreadCount(userId: string): Promise<number> {
    return NotificationModel.countDocuments({ userId, read: false });
  },

  async markRead(id: string, userId: string): Promise<void> {
    await NotificationModel.updateOne({ _id: id, userId }, { $set: { read: true } });
  },

  async markAllRead(userId: string): Promise<void> {
    await NotificationModel.updateMany({ userId, read: false }, { $set: { read: true } });
  },
};

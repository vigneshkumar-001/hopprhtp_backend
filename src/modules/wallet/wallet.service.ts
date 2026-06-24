import mongoose, { type ClientSession } from 'mongoose';
import { LedgerEntryModel, type LedgerType } from './ledger.model';
import { UserModel } from '../user/user.model';
import { BadRequest, NotFound } from '../../common/errors';

type Bucket = 'available' | 'cooling' | 'escrow';

const FIELD: Record<Bucket, 'walletAvailableKobo' | 'walletCoolingKobo' | 'escrowBalanceKobo'> = {
  available: 'walletAvailableKobo',
  cooling: 'walletCoolingKobo',
  escrow: 'escrowBalanceKobo',
};

interface MovementInput {
  userId: string;
  type: LedgerType;
  amountKobo: number; // signed
  bucket: Bucket;
  transactionId?: string;
  description: string;
  meta?: Record<string, unknown>;
  session?: ClientSession;
}

export const walletService = {
  /**
   * Atomically move money in/out of a wallet bucket and write the ledger entry.
   * Pass a session to make it part of a larger transaction.
   */
  async move(input: MovementInput): Promise<void> {
    const field = FIELD[input.bucket];
    const user = await UserModel.findByIdAndUpdate(
      input.userId,
      { $inc: { [field]: input.amountKobo } },
      { new: true, session: input.session },
    ).select(field);
    if (!user) throw NotFound('User not found');

    const balanceAfter = (user as unknown as Record<string, number>)[field];
    await LedgerEntryModel.create(
      [
        {
          userId: new mongoose.Types.ObjectId(input.userId),
          type: input.type,
          amountKobo: input.amountKobo,
          bucket: input.bucket,
          balanceAfterKobo: balanceAfter,
          transactionId: input.transactionId
            ? new mongoose.Types.ObjectId(input.transactionId)
            : undefined,
          description: input.description,
          meta: input.meta,
        },
      ],
      { session: input.session },
    );
  },

  async getBalance(userId: string) {
    const user = await UserModel.findById(userId)
      .select('walletAvailableKobo walletCoolingKobo escrowBalanceKobo')
      .lean();
    if (!user) throw NotFound('User not found');
    return {
      availableKobo: user.walletAvailableKobo,
      coolingKobo: user.walletCoolingKobo,
      escrowKobo: user.escrowBalanceKobo,
    };
  },

  async listLedger(userId: string, page = 1, perPage = 50) {
    const skip = (page - 1) * perPage;
    const [entries, total] = await Promise.all([
      LedgerEntryModel.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      LedgerEntryModel.countDocuments({ userId }),
    ]);
    return { page, perPage, total, entries };
  },

  /** Withdraw available funds to a saved payout account. */
  async withdraw(userId: string, amountKobo: number, accountId: string) {
    if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
      throw BadRequest('Withdrawal amount must be a positive integer (kobo)');
    }
    const user = await UserModel.findById(userId).select(
      'walletAvailableKobo payoutAccounts',
    );
    if (!user) throw NotFound('User not found');

    const account = user.payoutAccounts.find((a) => a._id.toString() === accountId);
    if (!account) throw NotFound('Payout account not found');
    if (user.walletAvailableKobo < amountKobo) throw BadRequest('Insufficient balance');

    await this.move({
      userId,
      type: 'withdrawal',
      amountKobo: -amountKobo,
      bucket: 'available',
      description: `Withdrawal to ${account.bank} ••${account.accountNumberLast4}`,
      meta: { accountId },
    });

    // TODO: enqueue an actual bank transfer (NIP / payout provider) here.
    return this.getBalance(userId);
  },
};

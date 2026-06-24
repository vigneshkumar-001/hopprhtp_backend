import { UserModel, type UserDocument } from './user.model';
import { Conflict, NotFound } from '../../common/errors';
import type {
  AddPayoutAccountInput,
  IdentityVerifyInput,
  UpdateProfileInput,
} from './user.schema';

export const userService = {
  async getById(id: string): Promise<UserDocument> {
    const user = await UserModel.findById(id);
    if (!user) throw NotFound('User not found');
    return user;
  },

  async updateProfile(id: string, input: UpdateProfileInput): Promise<UserDocument> {
    const user = await this.getById(id);

    if (input.email && input.email !== user.email) {
      const taken = await UserModel.exists({ email: input.email, _id: { $ne: id } });
      if (taken) throw Conflict('That email is already in use');
      user.email = input.email;
    }
    if (input.phone && input.phone !== user.phone) {
      const taken = await UserModel.exists({ phone: input.phone, _id: { $ne: id } });
      if (taken) throw Conflict('That phone number is already in use');
      user.phone = input.phone;
    }
    if (input.fullName) user.fullName = input.fullName;

    await user.save();
    return user;
  },

  async addPayoutAccount(id: string, input: AddPayoutAccountInput): Promise<UserDocument> {
    const user = await this.getById(id);

    const last4 = input.accountNumber.slice(-4);
    const duplicate = user.payoutAccounts.some(
      (a) => a.accountNumberLast4 === last4 && a.bank === input.bank,
    );
    if (duplicate) throw Conflict('That payout account is already saved');

    const makeDefault = input.makeDefault || user.payoutAccounts.length === 0;
    if (makeDefault) user.payoutAccounts.forEach((a) => (a.isDefault = false));

    user.payoutAccounts.push({
      bank: input.bank,
      accountNumberLast4: last4,
      accountName: input.accountName,
      isDefault: makeDefault,
      // A real deployment runs a name-match check with the bank (e.g. via a
      // NIBSS name-enquiry) before flipping this to true.
      verified: false,
      createdAt: new Date(),
    } as never);

    await user.save();
    return user;
  },

  async setDefaultPayoutAccount(id: string, accountId: string): Promise<UserDocument> {
    const user = await this.getById(id);
    const target = user.payoutAccounts.find((a) => a._id.toString() === accountId);
    if (!target) throw NotFound('Payout account not found');
    user.payoutAccounts.forEach((a) => (a.isDefault = a._id.toString() === accountId));
    await user.save();
    return user;
  },

  /** Submit KYC documents. Real review is async (webhook/queue); we mark pending. */
  async submitIdentity(id: string, input: IdentityVerifyInput): Promise<UserDocument> {
    const user = await this.getById(id);
    user.identity = {
      status: 'pending',
      docType: input.docType,
      documentUrl: input.documentUrl,
      selfieUrl: input.selfieUrl,
    };
    await user.save();
    return user;
  },
};

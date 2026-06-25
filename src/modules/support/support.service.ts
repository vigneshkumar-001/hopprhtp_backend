import { SupportTicketModel, type SupportTicketDocument } from './support.model';
import { generateSupportCode } from '../../common/utils/codes';
import { env } from '../../config/env';
import type { CreateTicketInput } from './support.schema';

/**
 * Static help content. Curated here (rather than the DB) so it ships instantly
 * and can be edited without an app release — swap for a CMS feed later if needed.
 */
const FAQS = [
  {
    category: 'transactions',
    question: 'How does Hoppr escrow protect my payment?',
    answer:
      "When a buyer pays, the money is held securely in escrow — not handed to the seller. Funds are only released once the buyer confirms the item arrived as described, so neither side can be cheated.",
  },
  {
    category: 'transactions',
    question: 'How do I create a transaction?',
    answer:
      'Tap “Create Transaction”, add the item details and amount, choose how the trust fee is split, then generate a payment link to share with your buyer.',
  },
  {
    category: 'payments',
    question: 'When is the money released to the seller?',
    answer:
      'After delivery is confirmed with the delivery OTP and the inspection (cooling) period passes with no dispute, the funds are released to the seller’s available balance.',
  },
  {
    category: 'payments',
    question: 'What is the trust fee?',
    answer:
      'Hoppr charges a small trust-protection fee (1.5%) per transaction for securing the escrow. When creating a deal you choose whether the buyer, the seller, or both share it.',
  },
  {
    category: 'disputes',
    question: 'What happens if there’s a problem with my order?',
    answer:
      'You can raise a dispute before the cooling period ends. The escrow is frozen, both parties submit evidence, and Hoppr reviews it to decide a fair outcome (refund or release).',
  },
  {
    category: 'verification',
    question: 'How do I get the HTP Verified badge?',
    answer:
      'Go to Profile → Identity verification and submit your details. Verified accounts build more trust with the people you deal with.',
  },
  {
    category: 'account',
    question: 'I forgot my PIN — what do I do?',
    answer:
      'Open Profile → Security & PIN → Change PIN. If you’re locked out, contact support and we’ll help you recover your account safely.',
  },
  {
    category: 'payments',
    question: 'How do I receive my payout?',
    answer:
      'Add a payout account under Profile → Payout accounts. Released funds move to your available balance and can be withdrawn to that account.',
  },
] as const;

function contact() {
  return {
    email: env.SUPPORT_EMAIL,
    phone: env.SUPPORT_PHONE,
    whatsapp: env.SUPPORT_WHATSAPP,
    hours: env.SUPPORT_HOURS,
  };
}

export const supportService = {
  /** Help-centre payload: contact channels + curated FAQs. */
  overview() {
    return { contact: contact(), faqs: FAQS };
  },

  /** Open a support request for the signed-in user. */
  async createTicket(userId: string, input: CreateTicketInput): Promise<SupportTicketDocument> {
    return SupportTicketModel.create({
      code: generateSupportCode(),
      userId,
      category: input.category,
      subject: input.subject,
      message: input.message,
      status: 'open',
    });
  },

  /** The signed-in user's most recent requests. */
  async listMine(userId: string) {
    return SupportTicketModel.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
  },
};

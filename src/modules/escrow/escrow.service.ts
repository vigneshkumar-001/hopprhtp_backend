import { escrowPay, escrowRest, escrowConfigured } from './escrow.client';
import { UserModel, type UserDocument } from '../user/user.model';
import { koboToNaira } from '../../common/utils/money';
import { logger } from '../../config/logger';

/**
 * Maps our domain onto the Escrow.com REST + Pay APIs. Every method degrades
 * gracefully when credentials are absent (local/dev): it logs and returns a
 * stub so the rest of the platform keeps working without the upstream.
 */

export interface EscrowParty {
  role: 'buyer' | 'seller' | 'broker';
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface EscrowItemInput {
  title: string;
  type?: string; // 'general_merchandise', 'motor_vehicle', ...
  amountKobo: number;
  inspectionPeriodSeconds: number;
  buyerEmail: string;
  sellerEmail: string;
}

export interface CreateEscrowInput {
  reference: string;
  description: string;
  currency?: string;
  returnUrl?: string;
  parties: EscrowParty[];
  items: EscrowItemInput[];
}

export type EscrowAction =
  | 'agree'
  | 'fund'
  | 'ship'
  | 'receive'
  | 'accept'
  | 'return_items'
  | 'receive_returned_items'
  | 'accept_return'
  | 'reject_return'
  | 'disburse'
  | 'cancel'
  | 'dispute';

export const escrowService = {
  /** Provision (once) an Escrow.com customer for the user; caches the id. */
  async ensureCustomer(user: UserDocument): Promise<string | null> {
    if (user.escrowCustomerId) return user.escrowCustomerId;
    if (!escrowConfigured() || !user.email) {
      logger.debug('escrow not configured / no email — skipping customer provisioning');
      return null;
    }

    const [firstName, ...rest] = user.fullName.split(' ');
    const { data } = await escrowRest.post<{ id: number }>('/customer', {
      email: user.email,
      first_name: firstName,
      last_name: rest.join(' ') || undefined,
      phone_number: user.phone,
    });

    const id = String(data.id);
    await UserModel.updateOne({ _id: user.id }, { escrowCustomerId: id });
    return id;
  },

  /** Create the underlying Escrow.com transaction (REST). Returns its id. */
  async createTransaction(input: CreateEscrowInput): Promise<{ escrowTransactionId: string | null }> {
    if (!escrowConfigured()) {
      logger.debug({ reference: input.reference }, 'escrow not configured — stubbing transaction');
      return { escrowTransactionId: null };
    }

    const body = {
      currency: input.currency ?? 'ngn',
      description: input.description,
      reference: input.reference,
      return_url: input.returnUrl,
      redirect_type: 'manual',
      items: input.items.map((it) => ({
        title: it.title,
        type: it.type ?? 'general_merchandise',
        quantity: 1,
        inspection_period: it.inspectionPeriodSeconds,
        schedule: [
          {
            amount: koboToNaira(it.amountKobo),
            payer_customer: it.buyerEmail,
            beneficiary_customer: it.sellerEmail,
          },
        ],
      })),
      parties: input.parties.map((p) => ({
        role: p.role,
        customer: p.email,
        first_name: p.firstName,
        last_name: p.lastName,
      })),
    };

    const { data } = await escrowRest.post<{ id: number }>('/transaction', body);
    return { escrowTransactionId: String(data.id) };
  },

  /** Generate an Escrow Pay landing page (hosted checkout). */
  async createPayLink(input: CreateEscrowInput): Promise<{
    landingPage: string | null;
    token: string | null;
    escrowTransactionId: string | null;
  }> {
    if (!escrowConfigured()) {
      return { landingPage: null, token: null, escrowTransactionId: null };
    }
    const body = {
      currency: input.currency ?? 'ngn',
      description: input.description,
      reference: input.reference,
      return_url: input.returnUrl,
      redirect_type: 'manual',
      items: input.items.map((it) => ({
        title: it.title,
        type: it.type ?? 'general_merchandise',
        quantity: 1,
        inspection_period: it.inspectionPeriodSeconds,
        schedule: [
          {
            amount: koboToNaira(it.amountKobo),
            payer_customer: it.buyerEmail,
            beneficiary_customer: it.sellerEmail,
          },
        ],
      })),
      parties: input.parties.map((p) => ({ role: p.role, customer: p.email })),
    };

    const { data } = await escrowPay.post<{
      landing_page: string;
      token: string;
      transaction_id: number;
    }>('', body);

    return {
      landingPage: data.landing_page,
      token: data.token,
      escrowTransactionId: String(data.transaction_id),
    };
  },

  /** Drive a lifecycle action on the Escrow.com transaction (PUT /transaction/{id}). */
  async action(
    escrowTransactionId: string | null | undefined,
    action: EscrowAction,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    if (!escrowConfigured() || !escrowTransactionId) {
      logger.debug({ action }, 'escrow not configured / no id — skipping action');
      return;
    }
    await escrowRest.put(`/transaction/${escrowTransactionId}`, { action, ...extra });
  },
};

import { env } from '../../config/env';
import { BadRequest } from '../errors';

/**
 * Money is handled in **kobo** (integer minor units, 1 NGN = 100 kobo)
 * everywhere on the server. Floats are never used for balances — this avoids
 * the rounding drift you get with `double` and keeps ledgers exact.
 *
 * The fee maths below is a 1:1 port of the Flutter `PaymentDraft` so the app
 * and server always agree to the kobo.
 */
export const KOBO_PER_NAIRA = 100;

export const nairaToKobo = (naira: number): number =>
  Math.round(naira * KOBO_PER_NAIRA);

export const koboToNaira = (kobo: number): number => kobo / KOBO_PER_NAIRA;

/** Assert a value is a non-negative integer number of kobo. */
export function assertKobo(value: number, field = 'amount'): number {
  if (!Number.isInteger(value) || value < 0) {
    throw BadRequest(`${field} must be a non-negative integer (kobo)`);
  }
  return value;
}

export type FeeSplit = 'buyer' | 'split' | 'seller';

export interface FeeBreakdown {
  itemSubtotal: number; // kobo
  deliveryFee: number; // kobo
  trustFull: number; // kobo — total Hoppr trust fee (1.5%)
  buyerTrustShare: number; // kobo
  sellerTrustShare: number; // kobo
  grandTotal: number; // kobo — what the buyer pays into escrow
  feeSplit: FeeSplit;
}

/**
 * Compute the full money breakdown for a transaction.
 * Mirrors `PaymentDraft`:
 *   trustFull        = round(itemSubtotal * trustRate)
 *   buyerTrustShare  = buyer→full | split→round(full/2) | seller→0
 *   sellerTrustShare = trustFull - buyerTrustShare
 *   grandTotal       = itemSubtotal + deliveryFee + buyerTrustShare
 */
export function computeFees(params: {
  itemSubtotalKobo: number;
  deliveryFeeKobo?: number;
  feeSplit?: FeeSplit;
}): FeeBreakdown {
  const itemSubtotal = assertKobo(params.itemSubtotalKobo, 'itemSubtotal');
  const deliveryFee = assertKobo(
    params.deliveryFeeKobo ?? nairaToKobo(env.DEFAULT_DELIVERY_FEE_NGN),
    'deliveryFee',
  );
  const feeSplit: FeeSplit = params.feeSplit ?? 'split';

  const trustFull = Math.round(itemSubtotal * env.TRUST_FEE_RATE);

  const buyerTrustShare =
    feeSplit === 'buyer'
      ? trustFull
      : feeSplit === 'split'
        ? Math.round(trustFull / 2)
        : 0;

  const sellerTrustShare = trustFull - buyerTrustShare;
  const grandTotal = itemSubtotal + deliveryFee + buyerTrustShare;

  return {
    itemSubtotal,
    deliveryFee,
    trustFull,
    buyerTrustShare,
    sellerTrustShare,
    grandTotal,
    feeSplit,
  };
}

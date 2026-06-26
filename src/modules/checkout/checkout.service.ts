import { TransactionModel, type TransactionDoc } from '../transaction/transaction.model';
import { transactionService } from '../transaction/transaction.service';
import { NotFound } from '../../common/errors';

/** Link validity window — the buyer's payment link is good for this many days. */
const LINK_VALID_DAYS = 7;

/** Only the fields the public payment page needs — no payout/bank details, no OTP.
 *  (Dispatch/waybill IMAGE urls are product evidence, safe to expose; the buyer
 *  needs them to verify what they're paying for.) */
function summarize(tx: TransactionDoc) {
  const deliveryAddress =
    tx.consignments.find((c) => Boolean(c.deliveryAddress))?.deliveryAddress ?? null;
  const dispatchPhotoUrl =
    tx.consignments.find((c) => Boolean(c.dispatchPhotoUrl))?.dispatchPhotoUrl ?? null;
  const waybillImageUrl =
    tx.consignments.find((c) => Boolean(c.waybillImageUrl))?.waybillImageUrl ?? null;

  // Link valid for N days from creation, through the end of that day (23:59).
  const expires = new Date(tx.createdAt ?? Date.now());
  expires.setDate(expires.getDate() + LINK_VALID_DAYS);
  expires.setHours(23, 59, 0, 0);

  return {
    code: tx.code,
    status: tx.status,
    merchantName: tx.merchantName,
    productName: tx.productName,
    variant: tx.variant ?? null,
    buyerContact: tx.buyerContact,
    deliveryAddress,
    consignments: tx.consignments.length,
    hasWaybill: Boolean(waybillImageUrl),
    hasDispatchPhoto: Boolean(dispatchPhotoUrl),
    dispatchPhotoUrl,
    waybillImageUrl,
    currency: tx.currency,
    itemSubtotalKobo: tx.itemSubtotalKobo,
    deliveryFeeKobo: tx.deliveryFeeKobo,
    buyerTrustShareKobo: tx.buyerTrustShareKobo,
    trustFullKobo: tx.trustFullKobo,
    grandTotalKobo: tx.grandTotalKobo,
    linkValidDays: LINK_VALID_DAYS,
    expiresAtMs: expires.getTime(),
  };
}

export const checkoutService = {
  async getByCode(code: string) {
    const tx = await TransactionModel.findOne({ code: code.trim().toUpperCase() }).lean();
    if (!tx) throw NotFound('No transaction with that code');
    return summarize(tx);
  },

  async pay(code: string) {
    return summarize(await transactionService.payByCode(code));
  },
};

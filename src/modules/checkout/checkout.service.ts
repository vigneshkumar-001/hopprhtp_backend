import { TransactionModel, type TransactionDoc } from '../transaction/transaction.model';
import { transactionService } from '../transaction/transaction.service';
import { NotFound } from '../../common/errors';

/** Only the fields the public payment page needs — no payout details / OTP. */
function summarize(tx: TransactionDoc) {
  return {
    code: tx.code,
    status: tx.status,
    merchantName: tx.merchantName,
    productName: tx.productName,
    variant: tx.variant ?? null,
    buyerContact: tx.buyerContact,
    consignments: tx.consignments.length,
    hasWaybill: tx.consignments.some((c) => Boolean(c.waybillImageUrl)),
    hasDispatchPhoto: tx.consignments.some((c) => Boolean(c.dispatchPhotoUrl)),
    currency: tx.currency,
    itemSubtotalKobo: tx.itemSubtotalKobo,
    deliveryFeeKobo: tx.deliveryFeeKobo,
    buyerTrustShareKobo: tx.buyerTrustShareKobo,
    trustFullKobo: tx.trustFullKobo,
    grandTotalKobo: tx.grandTotalKobo,
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

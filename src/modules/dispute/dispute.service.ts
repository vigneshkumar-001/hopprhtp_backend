import { Types } from 'mongoose';
import { DisputeModel, type DisputeDocument } from './dispute.model';
import { TransactionModel } from '../transaction/transaction.model';
import { nextStatus } from '../transaction/transaction.stateMachine';
import { walletService } from '../wallet/wallet.service';
import { escrowService } from '../escrow/escrow.service';
import { UserModel } from '../user/user.model';
import { generateDisputeCode } from '../../common/utils/codes';
import { BadRequest, Conflict, Forbidden, NotFound } from '../../common/errors';
import type { RaiseDisputeInput, ResolveDisputeInput } from './dispute.schema';

export const disputeService = {
  /** A party raises a dispute → freezes the escrow and runs a first-pass AI scan. */
  async raise(userId: string, input: RaiseDisputeInput): Promise<DisputeDocument> {
    const tx = await TransactionModel.findById(input.transactionId);
    if (!tx) throw NotFound('Transaction not found');

    const isSeller = tx.sellerId.toString() === userId;
    const isBuyer = tx.buyerId?.toString() === userId;
    if (!isSeller && !isBuyer) throw Forbidden('You are not a party to this transaction');

    const existing = await DisputeModel.findOne({
      transactionId: tx.id,
      status: { $ne: 'resolved' },
    });
    if (existing) throw Conflict('An open dispute already exists for this transaction');

    // Freeze the escrow (guarded by the state machine).
    tx.status = nextStatus('dispute', tx.status);
    tx.pushEvent('disputed', { category: input.category });
    await escrowService.action(tx.escrowTransactionId, 'dispute', {
      reason: input.reason,
      category: input.category,
    });
    await tx.save();

    const dispute = await DisputeModel.create({
      code: generateDisputeCode(),
      transactionId: tx.id,
      raisedById: userId,
      raisedByRole: isSeller ? 'seller' : 'buyer',
      category: input.category,
      reason: input.reason,
      status: 'under_review',
      evidence: input.evidence,
    });

    // Hoppr Vision first-pass (mock heuristic; swap for a real model/queue).
    dispute.ai = this.runAiAssessment(dispute);
    await dispute.save();

    return dispute;
  },

  /** Deterministic mock of the "Hoppr Vision" evidence pre-screen. */
  runAiAssessment(dispute: DisputeDocument) {
    const evidenceCount = dispute.evidence.length;
    const evidenceCompleteness = Math.min(1, 0.35 + evidenceCount * 0.2);
    const fraudRiskScore =
      dispute.category === 'fraud' ? 0.72 : dispute.category === 'not_delivered' ? 0.45 : 0.2;
    return {
      evidenceCompleteness: Number(evidenceCompleteness.toFixed(2)),
      fraudRiskScore: Number(fraudRiskScore.toFixed(2)),
      summary:
        evidenceCount === 0
          ? 'No supporting evidence attached. Counter-evidence from the other party is recommended before a decision.'
          : `Reviewed ${evidenceCount} item(s). Metadata consistent with the transaction record; manual confirmation advised.`,
      assessedAt: new Date(),
    };
  },

  async getForUser(id: string, userId: string, role: string): Promise<DisputeDocument> {
    const dispute = await DisputeModel.findById(id);
    if (!dispute) throw NotFound('Dispute not found');
    if (role !== 'admin') {
      const tx = await TransactionModel.findById(dispute.transactionId).select('sellerId buyerId').lean();
      const party = tx && (tx.sellerId.toString() === userId || tx.buyerId?.toString() === userId);
      if (!party) throw Forbidden('You are not a party to this dispute');
    }
    return dispute;
  },

  /** Admin resolution — moves money according to the outcome and closes the case. */
  async resolve(id: string, adminId: string, input: ResolveDisputeInput): Promise<DisputeDocument> {
    const dispute = await DisputeModel.findById(id);
    if (!dispute) throw NotFound('Dispute not found');
    if (dispute.status === 'resolved') throw Conflict('Dispute already resolved');

    const tx = await TransactionModel.findById(dispute.transactionId);
    if (!tx) throw NotFound('Transaction not found');
    if (tx.status !== 'disputed') throw BadRequest('Transaction is not in a disputed state');

    const sellerId = tx.sellerId.toString();

    if (input.outcome === 'buyer_favored') {
      if (!tx.buyerId) throw BadRequest('No buyer on this transaction to refund');
      // Refund the buyer everything except Hoppr's retained trust fee.
      const refundKobo = tx.grandTotalKobo - tx.trustFullKobo;
      tx.status = nextStatus('resolve_refund', tx.status); // → refunded
      await walletService.move({
        userId: tx.buyerId.toString(),
        type: 'buyer_refund',
        amountKobo: refundKobo,
        bucket: 'available',
        transactionId: tx.id,
        description: `Dispute refund for ${tx.code}`,
      });
      // Release the seller's escrow hold.
      await walletService.move({
        userId: sellerId,
        type: 'escrow_funded',
        amountKobo: -tx.itemSubtotalKobo,
        bucket: 'escrow',
        transactionId: tx.id,
        description: `Escrow reversed (dispute) for ${tx.code}`,
      });
      await escrowService.action(tx.escrowTransactionId, 'dispute', { resolution: 'refund_buyer' });
    } else {
      // Release to the seller.
      const sellerNetKobo = tx.itemSubtotalKobo - tx.sellerTrustShareKobo;
      tx.status = nextStatus('resolve_release', tx.status); // → released
      await walletService.move({
        userId: sellerId,
        type: 'escrow_funded',
        amountKobo: -tx.itemSubtotalKobo,
        bucket: 'escrow',
        transactionId: tx.id,
        description: `Escrow released (dispute) for ${tx.code}`,
      });
      await walletService.move({
        userId: sellerId,
        type: 'seller_payout',
        amountKobo: sellerNetKobo,
        bucket: 'available',
        transactionId: tx.id,
        description: `Dispute settlement for ${tx.code}`,
      });
      await escrowService.action(tx.escrowTransactionId, 'dispute', { resolution: 'release_seller' });
    }

    tx.pushEvent('dispute_resolved', { outcome: input.outcome });
    await tx.save();

    // Track the dispute against the losing party's record.
    await UserModel.updateOne({ _id: dispute.raisedById }, { $inc: { disputes: 1 } });

    dispute.status = 'resolved';
    dispute.resolution = {
      outcome: input.outcome,
      decidedById: new Types.ObjectId(adminId),
      decidedBy: 'manual_review',
      note: input.note,
      at: new Date(),
    };
    await dispute.save();

    return dispute;
  },
};

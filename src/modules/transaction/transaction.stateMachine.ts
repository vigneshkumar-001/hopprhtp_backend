import type { TxStatus } from './transaction.model';
import { InvalidTransition } from '../../common/errors';

/**
 * The complete set of lifecycle actions a transaction supports and, for each,
 * which source statuses are legal and the status it moves to. Centralising this
 * makes illegal transitions (e.g. shipping before payment) impossible.
 */
export type TxAction =
  | 'agree'
  | 'fund'
  | 'ship'
  | 'update_tracking'
  | 'out_for_delivery'
  | 'confirm_delivery'
  | 'release'
  | 'dispute'
  | 'resolve_refund'
  | 'resolve_release'
  | 'cancel'
  | 'expire';

interface Transition {
  from: TxStatus[];
  to: TxStatus;
}

export const TRANSITIONS: Record<TxAction, Transition> = {
  agree: { from: ['draft', 'awaiting_agreement'], to: 'awaiting_payment' },
  fund: { from: ['awaiting_payment'], to: 'payment_received' },
  ship: { from: ['payment_received', 'awaiting_dispatch'], to: 'in_transit' },
  // Tracking updates don't change the bucket; `to` mirrors the common source.
  update_tracking: { from: ['in_transit', 'out_for_delivery'], to: 'in_transit' },
  out_for_delivery: { from: ['in_transit'], to: 'out_for_delivery' },
  // Delivery confirmation moves item value straight into the cooling window.
  confirm_delivery: { from: ['in_transit', 'out_for_delivery'], to: 'cooling' },
  release: { from: ['cooling'], to: 'released' },
  dispute: { from: ['in_transit', 'out_for_delivery', 'delivered', 'cooling'], to: 'disputed' },
  resolve_refund: { from: ['disputed'], to: 'refunded' },
  resolve_release: { from: ['disputed'], to: 'released' },
  cancel: { from: ['draft', 'awaiting_agreement', 'awaiting_payment'], to: 'cancelled' },
  expire: { from: ['awaiting_dispatch', 'in_transit', 'out_for_delivery'], to: 'undeliverable' },
};

/** Assert an action is legal from the current status and return the next status. */
export function nextStatus(action: TxAction, current: TxStatus): TxStatus {
  const t = TRANSITIONS[action];
  if (!t.from.includes(current)) {
    throw InvalidTransition(
      `Cannot '${action}' a transaction that is '${current}'`,
      { action, current, allowedFrom: t.from },
    );
  }
  return t.to;
}

export const canTransition = (action: TxAction, current: TxStatus): boolean =>
  TRANSITIONS[action].from.includes(current);

import { ACTIVE_STATUSES, COMPLETED_STATUSES, customerName, needsPayment, paymentLabel, shortId, type Order } from '@mealdirect/shared';
import type { OrderAction } from '@/store/serverApi';

export type NextStep =
  | { kind: 'action'; action: OrderAction; label: string }
  | { kind: 'waiting'; message: string }
  | { kind: 'done' };

// The one thing the restaurant should do next, mirroring the backend's allowed transitions
export const nextStep = (order: Order): NextStep => {
  switch (order.status) {
    case 'pending':
      return needsPayment(order)
        ? { kind: 'waiting', message: 'Waiting for the customer to pay online' }
        : { kind: 'action', action: 'confirm', label: 'Accept order' };
    case 'confirmed':
      return { kind: 'action', action: 'mark-preparing', label: 'Start preparing' };
    case 'preparing':
      return { kind: 'action', action: 'mark-ready', label: 'Mark ready' };
    case 'ready':
      return order.deliveryType === 'delivery'
        ? { kind: 'action', action: 'mark-out-for-delivery', label: 'Send out for delivery' }
        : { kind: 'waiting', message: 'Ready for pickup. The customer confirms when they collect it.' };
    case 'out_for_delivery':
      return { kind: 'action', action: 'mark-delivered', label: 'Mark delivered' };
    default:
      return { kind: 'done' };
  }
};

// Once food is on its way it can't be taken back
export const canRestaurantCancel = (order: Pick<Order, 'status'>) =>
  ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);

export const needsAttention = (order: Order) =>
  order.status === 'pending' && !needsPayment(order);

// Shared with the admin app; re-exported so existing imports keep working
export { ACTIVE_STATUSES, COMPLETED_STATUSES, customerName, paymentLabel, shortId };

import { needsPayment, type Order } from '@mealdirect/shared';
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

export const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'] as const;
export const COMPLETED_STATUSES = ['delivered', 'picked_up'] as const;

// Once food is on its way it can't be taken back
export const canRestaurantCancel = (order: Pick<Order, 'status'>) =>
  ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);

export const needsAttention = (order: Order) =>
  order.status === 'pending' && !needsPayment(order);

export const paymentLabel = (order: Order) => {
  if (order.paymentMethod === 'cod') {
    return order.deliveryType === 'pickup' ? 'Pay at pickup' : 'Cash on delivery';
  }
  if (order.paymentStatus === 'completed') return 'Paid online';
  return order.paymentStatus === 'failed' ? 'Online payment failed' : 'Awaiting online payment';
};

export const customerName = (order: Order) =>
  [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ') || 'Customer';

export const shortId = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;
